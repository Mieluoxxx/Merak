import fs from "node:fs";
import { createRequire } from "node:module";
import type { NodeWebSocket } from "@hono/node-ws";
import { API_ROUTES } from "@merak/shared";
import { MERAK_ARTIFACT_CSS, MERAK_ARTIFACT_JS, UI_SDK_MANIFEST } from "@merak/ui/artifact";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { auth, type AuthInstance, type MerakDb } from "./auth/index.js";
import { db, sqlite } from "./db/client.js";
import { env } from "./env.js";
import { mountMcpRoutes } from "./mcp/index.js";
import {
  mountCoreRoutes,
  type MountCoreRoutesOptions,
  type MountedCoreRoutes,
} from "./routes/index.js";
import { HttpError } from "./services/errors.js";
import { createServices, type CreatedAppServices } from "./services/index.js";

const require = createRequire(import.meta.url);
let cachedUiSdkWebCss: string | null = null;

function getUiSdkWebCss(): string {
  if (cachedUiSdkWebCss === null) {
    const cssPath = require.resolve("@ui-sdk/core/web.css");
    cachedUiSdkWebCss = fs.readFileSync(cssPath, "utf8");
  }
  return cachedUiSdkWebCss;
}

export interface CreateAppOptions {
  services?: CreatedAppServices;
  auth?: AuthInstance;
  db?: MerakDb;
  sqlite?: typeof sqlite;
  enableWs?: boolean;
}

export { mountCoreRoutes, type MountCoreRoutesOptions, type MountedCoreRoutes };

export function createServerApp(options?: CreateAppOptions): {
  app: Hono;
  nodeWs?: NodeWebSocket;
} {
  const app = new Hono();
  const sqliteInstance = options?.sqlite ?? sqlite;
  const dbInstance = options?.db ?? db;
  const authInstance = options?.auth ?? auth;
  const services =
    options?.services ??
    createServices({
      db: dbInstance,
      sqlite: sqliteInstance,
      mediaDir: env.MEDIA_DIR,
    });

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
    if (err instanceof HttpError) {
      return c.json(
        {
          error: err.message,
          ...(err.code ? { code: err.code } : {}),
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
        err.status,
      );
    }
    if (err instanceof ZodError) {
      return c.json(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: err.issues,
        },
        400,
      );
    }
    console.error("[merak:server] unhandled error:", err);
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  });

  app.get(API_ROUTES.health, (c) => {
    const row = sqliteInstance.prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
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

  const { nodeWs } = mountCoreRoutes(app, services, {
    auth: authInstance,
    db: dbInstance,
    broadcaster: services.broadcaster,
    enableWs: options?.enableWs,
  });

  mountMcpRoutes(app, services);

  return { app, nodeWs };
}

export function createApp(options?: CreateAppOptions): Hono {
  return createServerApp(options).app;
}
