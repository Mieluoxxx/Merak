import type { WsServerEvent } from "@merak/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MerakWsClient,
  computeReconnectDelay,
  detectStaleConflict,
  invalidateQueriesForWsEvent,
  type WebSocketLike,
} from "../../lib/ws.js";

class MockWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }

  emitClose(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
}

describe("MerakWsClient and realtime helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes on open, sends heartbeats, and resubscribes with backoff after disconnect", () => {
    const sockets: MockWebSocket[] = [];
    const client = new MerakWsClient({
      url: "ws://test.local/ws",
      heartbeatIntervalMs: 5_000,
      baseReconnectDelayMs: 500,
      maxReconnectDelayMs: 4_000,
      createWebSocket: () => {
        const ws = new MockWebSocket();
        sockets.push(ws);
        return ws;
      },
    });

    const receivedEvents: WsServerEvent[] = [];
    client.onEvent((ev) => receivedEvents.push(ev));

    client.subscribe("space-a");
    client.connect();

    expect(sockets).toHaveLength(1);
    expect(client.getState()).toBe("connecting");

    sockets[0]!.emitOpen();
    expect(client.getState()).toBe("open");
    expect(sockets[0]!.sent).toEqual([
      JSON.stringify({ type: "subscribe", spaceId: "space-a" }),
    ]);

    // Heartbeat ping fires after 5s
    vi.advanceTimersByTime(5_000);
    expect(sockets[0]!.sent).toContain(JSON.stringify({ type: "ping" }));

    // Valid server event is dispatched; invalid JSON / unknown type is ignored
    const validEvent: WsServerEvent = {
      type: "node.updated",
      orgId: "org-1",
      spaceId: "space-a",
      nodeId: "node-1",
      version: 3,
      actorId: "mcp-agent",
    };
    sockets[0]!.emitMessage(validEvent);
    sockets[0]!.emitMessage("{not-json");
    sockets[0]!.emitMessage({ type: "unknown.event" });
    expect(receivedEvents).toEqual([validEvent]);

    // Unexpected close triggers exponential reconnect
    sockets[0]!.emitClose();
    expect(client.getState()).toBe("reconnecting");

    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emitOpen();
    expect(client.getState()).toBe("open");
    expect(sockets[1]!.sent).toEqual([
      JSON.stringify({ type: "subscribe", spaceId: "space-a" }),
    ]);

    client.unsubscribe("space-a");
    expect(sockets[1]!.sent).toContain(
      JSON.stringify({ type: "unsubscribe", spaceId: "space-a" }),
    );

    client.disconnect();
    expect(client.getState()).toBe("closed");
  });

  it("computes bounded exponential reconnect delays", () => {
    expect(computeReconnectDelay(0, 500, 10_000)).toBe(500);
    expect(computeReconnectDelay(1, 500, 10_000)).toBe(1_000);
    expect(computeReconnectDelay(2, 500, 10_000)).toBe(2_000);
    expect(computeReconnectDelay(10, 500, 10_000)).toBe(10_000);
  });

  it("invalidates relevant TanStack Query keys for every WsServerEvent", () => {
    const invalidated: unknown[][] = [];
    const fakeQueryClient = {
      invalidateQueries: vi.fn(async (filters?: { queryKey?: readonly unknown[] }) => {
        if (filters?.queryKey) {
          invalidated.push([...filters.queryKey]);
        }
      }),
    };

    invalidateQueriesForWsEvent(fakeQueryClient, {
      type: "node.created",
      orgId: "o1",
      spaceId: "s1",
      nodeId: "n1",
      parentId: null,
      actorId: "u2",
    });
    invalidateQueriesForWsEvent(fakeQueryClient, {
      type: "node.updated",
      orgId: "o1",
      spaceId: "s1",
      nodeId: "n1",
      version: 2,
      actorId: "u2",
    });
    invalidateQueriesForWsEvent(
      fakeQueryClient,
      {
        type: "node.updated",
        orgId: "o1",
        spaceId: "s1",
        nodeId: "n-dirty",
        version: 4,
        actorId: "u2",
      },
      { skipNodeInvalidationId: "n-dirty" },
    );
    invalidateQueriesForWsEvent(fakeQueryClient, {
      type: "space.changed",
      orgId: "o1",
      spaceId: "s1",
      actorId: "u2",
    });
    invalidateQueriesForWsEvent(fakeQueryClient, {
      type: "media.created",
      orgId: "o1",
      spaceId: "s1",
      mediaId: "m1",
      actorId: "u2",
    });

    expect(invalidated).toEqual([
      ["tree", "s1"],
      ["tree", "s1"],
      ["node", "n1"],
      ["tree", "s1"], // skipped ["node", "n-dirty"] to avoid clobbering dirty local edits
      ["spaces"],
      ["tree", "s1"],
      ["media"],
    ]);
  });

  it("detects stale-edit conflicts only when editing dirty local state or on remote deletion", () => {
    const updateEvent: WsServerEvent = {
      type: "node.updated",
      orgId: "o1",
      spaceId: "s1",
      nodeId: "n1",
      version: 5,
      actorId: "agent-1",
    };

    // Dirty + newer remote version + different actor => conflict
    expect(
      detectStaleConflict(updateEvent, {
        editingNodeId: "n1",
        localVersion: 4,
        isDirty: true,
        currentUserId: "user-1",
      }),
    ).toEqual(updateEvent);

    // Clean editor => no conflict (can silently refetch)
    expect(
      detectStaleConflict(updateEvent, {
        editingNodeId: "n1",
        localVersion: 4,
        isDirty: false,
        currentUserId: "user-1",
      }),
    ).toBeNull();

    // Same actor => no conflict
    expect(
      detectStaleConflict(updateEvent, {
        editingNodeId: "n1",
        localVersion: 4,
        isDirty: true,
        currentUserId: "agent-1",
      }),
    ).toBeNull();

    // Remote version not newer => no conflict
    expect(
      detectStaleConflict(updateEvent, {
        editingNodeId: "n1",
        localVersion: 5,
        isDirty: true,
        currentUserId: "user-1",
      }),
    ).toBeNull();

    // Remote delete of active node => conflict even if clean
    const deleteEvent: WsServerEvent = {
      type: "node.deleted",
      orgId: "o1",
      spaceId: "s1",
      nodeId: "n1",
      actorId: "teammate-2",
    };
    expect(
      detectStaleConflict(deleteEvent, {
        editingNodeId: "n1",
        localVersion: 5,
        isDirty: false,
        currentUserId: "user-1",
      }),
    ).toEqual(deleteEvent);
  });
});
