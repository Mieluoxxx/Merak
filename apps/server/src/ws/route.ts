import { createNodeWebSocket, type NodeWebSocket } from "@hono/node-ws";
import { API_ROUTES } from "@merak/shared";
import type { Hono } from "hono";
import {
  type AuthMiddlewareDeps,
  resolveAuthFromHeaders,
} from "../auth/middleware.js";
import type { AuthContext } from "../services/types.js";
import type { WsBroadcaster } from "./broadcaster.js";

export interface MountWsDeps extends AuthMiddlewareDeps {
  broadcaster: WsBroadcaster;
}

export function mountWsRoute(
  app: Hono<any, any, any>,
  deps: MountWsDeps,
): NodeWebSocket {
  const nodeWs = createNodeWebSocket({ app });

  app.get(
    API_ROUTES.ws,
    async (c, next) => {
      const queryToken = c.req.query("token") ?? null;
      const ctx = await resolveAuthFromHeaders(c.req.raw.headers, deps, {
        queryToken,
      });
      if (!ctx) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      c.set("auth", ctx);
      await next();
    },
    nodeWs.upgradeWebSocket((c) => {
      const ctx = c.get("auth") as AuthContext;
      return {
        onOpen(_event, ws) {
          deps.broadcaster.addClient(ws, ctx);
        },
        async onMessage(event, ws) {
          const text =
            typeof event.data === "string"
              ? event.data
              : event.data instanceof ArrayBuffer
                ? new TextDecoder().decode(event.data)
                : String(event.data);
          await deps.broadcaster.handleMessage(ws, text);
        },
        onClose(_event, ws) {
          deps.broadcaster.removeClient(ws);
        },
        onError(_event, ws) {
          deps.broadcaster.removeClient(ws);
        },
      };
    }),
  );

  return nodeWs;
}
