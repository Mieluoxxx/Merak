import type { NodeWebSocket } from "@hono/node-ws";
import { API_ROUTES } from "@merak/shared";
import type { Hono } from "hono";
import {
  auth as defaultAuth,
  type AuthInstance,
  type MerakDb,
} from "../auth/index.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import { db as defaultDb } from "../db/client.js";
import type { AppServices } from "../services/types.js";
import { mountWsRoute, WsBroadcaster } from "../ws/index.js";
import { mountMcpTokenRoutes } from "./mcp-tokens.js";
import { mountMediaRoutes } from "./media.js";
import { mountNodeRoutes } from "./nodes.js";
import { mountSearchRoutes } from "./search.js";
import { mountSpaceRoutes } from "./spaces.js";

export interface MountCoreRoutesOptions {
  auth?: AuthInstance;
  db?: MerakDb;
  broadcaster?: WsBroadcaster;
  enableWs?: boolean;
}

export interface MountedCoreRoutes {
  nodeWs?: NodeWebSocket;
}

export function mountCoreRoutes(
  app: Hono<any, any, any>,
  services: AppServices,
  options?: MountCoreRoutesOptions,
): MountedCoreRoutes {
  const authInstance = options?.auth ?? defaultAuth;
  const dbInstance = options?.db ?? defaultDb;

  // Better Auth handler (public auth endpoints)
  app.on(["POST", "GET"], `${API_ROUTES.authBase}/*`, (c) =>
    authInstance.handler(c.req.raw),
  );

  // Dual session / MCP token auth middleware for protected API routes
  const authMiddleware = createAuthMiddleware({
    auth: authInstance,
    mcpTokens: services.mcpTokens,
    db: dbInstance,
  });

  const protectedPatterns = [
    API_ROUTES.spaces,
    `${API_ROUTES.spaces}/*`,
    API_ROUTES.nodes,
    `${API_ROUTES.nodes}/*`,
    API_ROUTES.media,
    `${API_ROUTES.media}/*`,
    API_ROUTES.search,
    API_ROUTES.mcpTokens,
    `${API_ROUTES.mcpTokens}/*`,
  ];

  for (const pattern of protectedPatterns) {
    app.use(pattern, authMiddleware);
  }

  mountSpaceRoutes(app, services);
  mountNodeRoutes(app, services);
  mountMediaRoutes(app, services);
  mountSearchRoutes(app, services);
  mountMcpTokenRoutes(app, services);

  const broadcaster =
    options?.broadcaster ??
    (services.realtime instanceof WsBroadcaster ? services.realtime : undefined);

  let nodeWs: NodeWebSocket | undefined;
  if (options?.enableWs !== false && broadcaster) {
    nodeWs = mountWsRoute(app, {
      auth: authInstance,
      mcpTokens: services.mcpTokens,
      db: dbInstance,
      broadcaster,
    });
  }

  return { nodeWs };
}
