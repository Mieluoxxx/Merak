import { wsClientMessageSchema, type WsServerEvent } from "@merak/shared";
import { and, eq } from "drizzle-orm";
import type { MerakDb } from "../auth/index.js";
import { canAccessSpace } from "../auth/middleware.js";
import * as schema from "../db/schema.js";
import type { AuthContext, RealtimeBroadcaster } from "../services/types.js";

export interface WsClientSocket {
  send(data: string): void;
  close?(code?: number, reason?: string): void;
}

interface ClientSession {
  ctx: AuthContext;
  subscribedSpaces: Set<string>;
}

export class WsBroadcaster implements RealtimeBroadcaster {
  private readonly db: MerakDb;
  private readonly clients = new Map<WsClientSocket, ClientSession>();
  private readonly spaceSubscribers = new Map<string, Set<WsClientSocket>>();
  private readonly orgClients = new Map<string, Set<WsClientSocket>>();

  constructor(db: MerakDb) {
    this.db = db;
  }

  addClient(ws: WsClientSocket, ctx: AuthContext): void {
    this.clients.set(ws, {
      ctx,
      subscribedSpaces: new Set(),
    });
    let orgSet = this.orgClients.get(ctx.orgId);
    if (!orgSet) {
      orgSet = new Set();
      this.orgClients.set(ctx.orgId, orgSet);
    }
    orgSet.add(ws);
  }

  removeClient(ws: WsClientSocket): void {
    const session = this.clients.get(ws);
    if (!session) return;

    for (const spaceId of session.subscribedSpaces) {
      const subSet = this.spaceSubscribers.get(spaceId);
      if (subSet) {
        subSet.delete(ws);
        if (subSet.size === 0) {
          this.spaceSubscribers.delete(spaceId);
        }
      }
    }

    const orgSet = this.orgClients.get(session.ctx.orgId);
    if (orgSet) {
      orgSet.delete(ws);
      if (orgSet.size === 0) {
        this.orgClients.delete(session.ctx.orgId);
      }
    }

    this.clients.delete(ws);
  }

  async subscribe(ws: WsClientSocket, spaceId: string): Promise<boolean> {
    const session = this.clients.get(ws);
    if (!session) return false;

    if (!canAccessSpace(session.ctx, spaceId)) {
      this.safeSend(ws, JSON.stringify({ type: "error", message: "Forbidden space" }));
      return false;
    }

    const found = await this.db
      .select({ id: schema.spaces.id })
      .from(schema.spaces)
      .where(
        and(
          eq(schema.spaces.id, spaceId),
          eq(schema.spaces.orgId, session.ctx.orgId),
        ),
      )
      .limit(1);

    if (found.length === 0) {
      this.safeSend(ws, JSON.stringify({ type: "error", message: "Space not found" }));
      return false;
    }

    session.subscribedSpaces.add(spaceId);
    let subSet = this.spaceSubscribers.get(spaceId);
    if (!subSet) {
      subSet = new Set();
      this.spaceSubscribers.set(spaceId, subSet);
    }
    subSet.add(ws);
    return true;
  }

  unsubscribe(ws: WsClientSocket, spaceId: string): void {
    const session = this.clients.get(ws);
    if (!session) return;

    session.subscribedSpaces.delete(spaceId);
    const subSet = this.spaceSubscribers.get(spaceId);
    if (subSet) {
      subSet.delete(ws);
      if (subSet.size === 0) {
        this.spaceSubscribers.delete(spaceId);
      }
    }
  }

  async handleMessage(ws: WsClientSocket, rawMessage: string): Promise<void> {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawMessage);
    } catch {
      this.safeSend(ws, JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    const parsed = wsClientMessageSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.safeSend(ws, JSON.stringify({ type: "error", message: "Invalid message" }));
      return;
    }

    const message = parsed.data;
    switch (message.type) {
      case "ping":
        this.safeSend(ws, JSON.stringify({ type: "pong" }));
        return;
      case "subscribe":
        await this.subscribe(ws, message.spaceId);
        return;
      case "unsubscribe":
        this.unsubscribe(ws, message.spaceId);
        return;
    }
  }

  publish(event: WsServerEvent): void {
    const payload = JSON.stringify(event);

    if (
      event.type === "space.changed" ||
      event.type === "media.created" ||
      event.type === "media.deleted"
    ) {
      const orgSet = this.orgClients.get(event.orgId);
      if (!orgSet) return;
      for (const ws of [...orgSet]) {
        const session = this.clients.get(ws);
        if (!session) continue;
        if (event.spaceId && !canAccessSpace(session.ctx, event.spaceId)) {
          continue;
        }
        this.safeSend(ws, payload);
      }
      return;
    }

    const subSet = this.spaceSubscribers.get(event.spaceId);
    if (!subSet) return;

    for (const ws of [...subSet]) {
      const session = this.clients.get(ws);
      if (!session || session.ctx.orgId !== event.orgId) {
        continue;
      }
      if (!canAccessSpace(session.ctx, event.spaceId)) {
        continue;
      }
      this.safeSend(ws, payload);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSpaceSubscriberCount(spaceId: string): number {
    return this.spaceSubscribers.get(spaceId)?.size ?? 0;
  }

  private safeSend(ws: WsClientSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      this.removeClient(ws);
    }
  }
}
