import { API_ROUTES } from "@merak/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sqlite } from "./db/client.js";
import { env } from "./env.js";

export function createApp(): Hono {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: env.WEB_ORIGIN,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.onError((err, c) => {
    console.error("[merak:server] unhandled error:", err);
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  });

  app.get(API_ROUTES.health, (c) => {
    const row = sqlite.prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
    return c.json({
      ok: row?.ok === 1,
      db: "sqlite",
      timestamp: new Date().toISOString(),
    });
  });

  // Wave 1 extension points:
  // - Worker #1: mount Better Auth (/api/auth/*), Spaces/Nodes/Search/Media/McpTokens routes, and /ws
  // - Worker #2: mount Streamable HTTP MCP server (/mcp)

  return app;
}
