import fs from "node:fs";
import { createRequire } from "node:module";
import { API_ROUTES } from "@merak/shared";
import { MERAK_ARTIFACT_CSS, MERAK_ARTIFACT_JS, UI_SDK_MANIFEST } from "@merak/ui/artifact";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sqlite } from "./db/client.js";
import { env } from "./env.js";

const require = createRequire(import.meta.url);
let cachedUiSdkWebCss: string | null = null;

function getUiSdkWebCss(): string {
  if (cachedUiSdkWebCss === null) {
    const cssPath = require.resolve("@ui-sdk/core/web.css");
    cachedUiSdkWebCss = fs.readFileSync(cssPath, "utf8");
  }
  return cachedUiSdkWebCss;
}

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

  app.use("/ui-sdk/*", cors({ origin: "*" }));

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

  // Public read-only UI SDK assets shared by main app and sandboxed HTML Artifacts.
  app.get(API_ROUTES.uiSdkWebCss, (c) => {
    return c.text(getUiSdkWebCss(), 200, {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });

  app.get(API_ROUTES.uiSdkCss, (c) => {
    return c.text(MERAK_ARTIFACT_CSS, 200, {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });

  app.get(API_ROUTES.uiSdkJs, (c) => {
    return c.text(MERAK_ARTIFACT_JS, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });

  app.get(API_ROUTES.uiSdkManifest, (c) => {
    return c.json(UI_SDK_MANIFEST);
  });

  // Wave 1 extension points:
  // - Worker #1: mount Better Auth (/api/auth/*), Spaces/Nodes/Search/Media/McpTokens routes, and /ws
  // - Worker #2: mount Streamable HTTP MCP server (/mcp)

  return app;
}
