import type { NodeDetailDto, UpdateNodeInput } from "@merak/shared";
import { describe, expect, it, vi } from "vitest";
import { createNodeSaveQueue } from "../api/autoSaveQueue.js";

function makeNode(overrides: Partial<NodeDetailDto> = {}): NodeDetailDto {
  return {
    id: overrides.id ?? "nod_1",
    spaceId: "spc_1",
    parentId: null,
    type: "doc",
    title: overrides.title ?? "Untitled",
    icon: null,
    sortOrder: "i",
    version: overrides.version ?? 1,
    updatedAt: "2026-11-27T00:00:00.000Z",
    updatedBy: "usr_1",
    content: overrides.content ?? "",
    createdAt: "2026-11-27T00:00:00.000Z",
    createdBy: "usr_1",
    deletedAt: null,
  };
}

describe("createNodeSaveQueue", () => {
  it("serializes per-node patches, coalesces queued edits, and chains server versions", async () => {
    const versions = new Map<string, number>([["nod_1", 1]]);
    const calls: Array<{ nodeId: string; payload: UpdateNodeInput; keepalive?: boolean }> = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const stateTransitions: Array<{
      inFlight: boolean;
      hasQueued: boolean;
      lastOutcome: "saved" | "error" | null;
    }> = [];
    const onSaved = vi.fn((nodeId: string, updated: NodeDetailDto) => {
      versions.set(nodeId, updated.version);
    });
    const onError = vi.fn();

    const queue = createNodeSaveQueue({
      getExpectedVersion: (nodeId) => versions.get(nodeId),
      sendPatch: async (nodeId, payload, options) => {
        calls.push({ nodeId, payload, keepalive: options?.keepalive });
        if (calls.length === 1) {
          await firstGate;
        }
        const nextVersion = (versions.get(nodeId) ?? 1) + 1;
        return makeNode({
          id: nodeId,
          version: nextVersion,
          content: payload.content ?? "",
          title: payload.title ?? "Untitled",
        });
      },
      onSaved,
      onError,
      onStateChange: (_nodeId, state) => {
        stateTransitions.push(state);
      },
    });

    const firstDone = queue.enqueue("nod_1", { content: "v1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toEqual({ content: "v1", expectedVersion: 1 });
    expect(queue.isBusy("nod_1")).toBe(true);

    // Enqueue multiple overlapping content + title updates while first request is in flight.
    void queue.enqueue("nod_1", { content: "v2" });
    const thirdDone = queue.enqueue("nod_1", { title: "Renamed" }, { keepalive: true });
    expect(calls).toHaveLength(1);

    releaseFirst();
    await Promise.all([firstDone, thirdDone]);

    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      nodeId: "nod_1",
      payload: { content: "v2", title: "Renamed", expectedVersion: 2 },
      keepalive: true,
    });
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(queue.isBusy("nod_1")).toBe(false);
    expect(stateTransitions.at(-1)).toEqual({
      inFlight: false,
      hasQueued: false,
      lastOutcome: "saved",
    });
  });

  it("keeps different nodes independent and recovers cleanly after an error", async () => {
    const versions = new Map<string, number>([
      ["nod_a", 1],
      ["nod_b", 5],
    ]);
    let failNextA = true;
    const onSaved = vi.fn((nodeId: string, updated: NodeDetailDto) => {
      versions.set(nodeId, updated.version);
    });
    const onError = vi.fn();

    const queue = createNodeSaveQueue({
      getExpectedVersion: (nodeId) => versions.get(nodeId),
      sendPatch: async (nodeId, payload) => {
        if (nodeId === "nod_a" && failNextA) {
          failNextA = false;
          throw new Error("Transient failure");
        }
        return makeNode({
          id: nodeId,
          version: (versions.get(nodeId) ?? 1) + 1,
          content: payload.content ?? "",
        });
      },
      onSaved,
      onError,
    });

    await queue.enqueue("nod_a", { content: "draft a" });
    await queue.enqueue("nod_b", { content: "draft b" });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(versions.get("nod_b")).toBe(6);
    expect(queue.isBusy("nod_a")).toBe(false);

    // Retry nod_a cleanly after failure.
    await queue.enqueue("nod_a", { content: "draft a retry" });
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(versions.get("nod_a")).toBe(2);
  });
});
