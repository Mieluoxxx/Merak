import {
  API_ROUTES,
  wsClientMessageSchema,
  wsServerEventSchema,
  type WsClientMessage,
  type WsServerEvent,
} from "@merak/shared";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workspaceQueryKeys } from "../features/api/workspace-api.js";
import type { StaleConflictEvent } from "../layout/StaleConflictBanner.js";

export { StaleConflictBanner, type StaleConflictBannerProps, type StaleConflictEvent } from "../layout/StaleConflictBanner.js";

export type WsConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

const WS_OPEN = 1;

export interface MerakWsClientOptions {
  url?: string;
  heartbeatIntervalMs?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  createWebSocket?: WebSocketFactory;
}

export function resolveWsUrl(path: string = API_ROUTES.ws): string {
  if (/^wss?:\/\//.test(path)) return path;
  if (typeof window === "undefined") {
    return `ws://localhost:3000${path}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

export function computeReconnectDelay(
  attempt: number,
  baseDelayMs = 500,
  maxDelayMs = 30_000,
  jitterRatio = 0,
): number {
  const safeAttempt = Math.max(0, attempt);
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** safeAttempt);
  if (jitterRatio <= 0) return exp;
  const jitter = exp * jitterRatio * Math.random();
  return Math.round(Math.min(maxDelayMs, exp + jitter));
}

export class MerakWsClient {
  private readonly url: string;
  private readonly heartbeatIntervalMs: number;
  private readonly baseReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly createWebSocket: WebSocketFactory;

  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private manuallyClosed = false;
  private state: WsConnectionState = "idle";

  private readonly subscribedSpaces = new Set<string>();
  private readonly eventListeners = new Set<(event: WsServerEvent) => void>();
  private readonly stateListeners = new Set<(state: WsConnectionState) => void>();

  constructor(options: MerakWsClientOptions = {}) {
    this.url = options.url ?? resolveWsUrl(API_ROUTES.ws);
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 25_000;
    this.baseReconnectDelayMs = options.baseReconnectDelayMs ?? 500;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.createWebSocket =
      options.createWebSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
  }

  getState(): WsConnectionState {
    return this.state;
  }

  getSubscribedSpaces(): string[] {
    return [...this.subscribedSpaces];
  }

  connect(): void {
    if (this.socket && this.socket.readyState === WS_OPEN) return;
    this.manuallyClosed = false;
    this.clearReconnectTimer();
    this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    const ws = this.createWebSocket(this.url);
    this.socket = ws;

    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.reconnectAttempt = 0;
      this.setState("open");
      this.startHeartbeat();
      for (const spaceId of this.subscribedSpaces) {
        this.sendMessage({ type: "subscribe", spaceId });
      }
    };

    ws.onmessage = (msg) => {
      if (typeof msg.data !== "string") return;
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(msg.data);
      } catch {
        return;
      }
      const parsed = wsServerEventSchema.safeParse(parsedJson);
      if (!parsed.success) return;
      for (const listener of this.eventListeners) {
        listener(parsed.data);
      }
    };

    ws.onerror = () => {
      // onclose handles scheduling reconnects
    };

    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      this.stopHeartbeat();
      if (this.manuallyClosed) {
        this.setState("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    const current = this.socket;
    this.socket = null;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      try {
        current.close(1000, "client disconnect");
      } catch {
        // ignore close errors on already-closing sockets
      }
    }
    this.setState("closed");
  }

  subscribe(spaceId: string): void {
    if (!spaceId) return;
    if (this.subscribedSpaces.has(spaceId)) return;
    this.subscribedSpaces.add(spaceId);
    this.sendMessage({ type: "subscribe", spaceId });
  }

  unsubscribe(spaceId: string): void {
    if (!this.subscribedSpaces.has(spaceId)) return;
    this.subscribedSpaces.delete(spaceId);
    this.sendMessage({ type: "unsubscribe", spaceId });
  }

  setSubscriptions(spaceIds: readonly string[]): void {
    const next = new Set(spaceIds.filter(Boolean));
    for (const currentId of [...this.subscribedSpaces]) {
      if (!next.has(currentId)) {
        this.unsubscribe(currentId);
      }
    }
    for (const nextId of next) {
      if (!this.subscribedSpaces.has(nextId)) {
        this.subscribe(nextId);
      }
    }
  }

  onEvent(listener: (event: WsServerEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  onStateChange(listener: (state: WsConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  sendMessage(message: WsClientMessage): boolean {
    const validated = wsClientMessageSchema.safeParse(message);
    if (!validated.success) return false;
    if (!this.socket || this.socket.readyState !== WS_OPEN) return false;
    try {
      this.socket.send(JSON.stringify(validated.data));
      return true;
    } catch {
      return false;
    }
  }

  private setState(next: WsConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const listener of this.stateListeners) {
      listener(next);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (this.heartbeatIntervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({ type: "ping" });
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = computeReconnectDelay(
      this.reconnectAttempt,
      this.baseReconnectDelayMs,
      this.maxReconnectDelayMs,
    );
    this.reconnectAttempt += 1;
    this.setState("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manuallyClosed) {
        this.connect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export interface EditingSessionContext {
  editingNodeId?: string | null;
  localVersion?: number | null;
  isDirty?: boolean;
  currentUserId?: string | null;
}

export function detectStaleConflict(
  event: WsServerEvent,
  editing: EditingSessionContext,
): StaleConflictEvent | null {
  if (!editing.editingNodeId) return null;

  if (event.type === "node.deleted" && event.nodeId === editing.editingNodeId) {
    if (editing.currentUserId && event.actorId === editing.currentUserId) {
      return null;
    }
    return event;
  }

  if (event.type === "node.updated" && event.nodeId === editing.editingNodeId) {
    if (editing.currentUserId && event.actorId === editing.currentUserId) {
      return null;
    }
    const isRemoteNewer =
      editing.localVersion == null ? true : event.version > editing.localVersion;
    if (editing.isDirty && isRemoteNewer) {
      return event;
    }
  }

  return null;
}

export function invalidateQueriesForWsEvent(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  event: WsServerEvent,
  options?: { skipNodeInvalidationId?: string | null },
): void {
  switch (event.type) {
    case "node.created":
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(event.spaceId) });
      break;
    case "node.updated":
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(event.spaceId) });
      if (options?.skipNodeInvalidationId !== event.nodeId) {
        void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.node(event.nodeId) });
      }
      break;
    case "node.deleted":
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(event.spaceId) });
      if (options?.skipNodeInvalidationId !== event.nodeId) {
        void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.node(event.nodeId) });
      }
      break;
    case "tree.changed":
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(event.spaceId) });
      break;
    case "space.changed":
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.spaces() });
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(event.spaceId) });
      break;
    case "media.created":
    case "media.deleted":
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.media() });
      break;
    case "comment.changed":
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.comments(event.nodeId) });
      break;
  }
}

export interface UseWorkspaceRealtimeOptions extends EditingSessionContext {
  spaceIds: readonly string[];
  enabled?: boolean;
  url?: string;
  onEvent?: (event: WsServerEvent) => void;
  onReloadNode?: (nodeId: string) => void | Promise<void>;
}

export interface UseWorkspaceRealtimeResult {
  connectionState: WsConnectionState;
  lastEvent: WsServerEvent | null;
  conflictEvent: StaleConflictEvent | null;
  dismissConflict: () => void;
  reloadRemote: () => Promise<void>;
}

export function useWorkspaceRealtime(
  options: UseWorkspaceRealtimeOptions,
): UseWorkspaceRealtimeResult {
  const {
    spaceIds,
    enabled = true,
    url,
    editingNodeId = null,
    localVersion = null,
    isDirty = false,
    currentUserId = null,
    onEvent,
    onReloadNode,
  } = options;

  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<WsConnectionState>("idle");
  const [lastEvent, setLastEvent] = useState<WsServerEvent | null>(null);
  const [conflictEvent, setConflictEvent] = useState<StaleConflictEvent | null>(null);

  const clientRef = useRef<MerakWsClient | null>(null);
  const editingRef = useRef<EditingSessionContext>({
    editingNodeId,
    localVersion,
    isDirty,
    currentUserId,
  });
  const onEventRef = useRef(onEvent);

  editingRef.current = { editingNodeId, localVersion, isDirty, currentUserId };
  onEventRef.current = onEvent;

  // Clear conflict when navigating to a different node
  useEffect(() => {
    setConflictEvent((prev) => (prev && prev.nodeId !== editingNodeId ? null : prev));
  }, [editingNodeId]);

  const stableSpaceKey = useMemo(() => [...new Set(spaceIds)].sort().join("|"), [spaceIds]);

  useEffect(() => {
    if (!enabled) {
      setConnectionState("idle");
      return;
    }

    const client = new MerakWsClient({ url });
    clientRef.current = client;

    const unsubState = client.onStateChange((state) => {
      setConnectionState(state);
    });

    const unsubEvent = client.onEvent((event) => {
      setLastEvent(event);
      const conflict = detectStaleConflict(event, editingRef.current);
      const isOwnNodeUpdate =
        event.type === "node.updated" &&
        event.nodeId === editingRef.current.editingNodeId &&
        Boolean(editingRef.current.currentUserId) &&
        event.actorId === editingRef.current.currentUserId;
      if (conflict) {
        setConflictEvent(conflict);
        invalidateQueriesForWsEvent(queryClient, event, {
          skipNodeInvalidationId: conflict.nodeId,
        });
      } else if (isOwnNodeUpdate) {
        invalidateQueriesForWsEvent(queryClient, event, {
          skipNodeInvalidationId: event.nodeId,
        });
      } else {
        invalidateQueriesForWsEvent(queryClient, event);
      }
      onEventRef.current?.(event);
    });

    client.setSubscriptions(stableSpaceKey ? stableSpaceKey.split("|") : []);
    client.connect();

    return () => {
      unsubEvent();
      unsubState();
      client.disconnect();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [enabled, url, queryClient]);

  useEffect(() => {
    if (!enabled || !clientRef.current) return;
    clientRef.current.setSubscriptions(stableSpaceKey ? stableSpaceKey.split("|") : []);
  }, [enabled, stableSpaceKey]);

  const dismissConflict = useCallback(() => {
    setConflictEvent(null);
  }, []);

  const reloadRemote = useCallback(async () => {
    const current = conflictEvent;
    setConflictEvent(null);
    if (!current) return;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(current.spaceId) }),
      queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.node(current.nodeId) }),
    ]);
    await onReloadNode?.(current.nodeId);
  }, [conflictEvent, onReloadNode, queryClient]);

  return {
    connectionState,
    lastEvent,
    conflictEvent,
    dismissConflict,
    reloadRemote,
  };
}
