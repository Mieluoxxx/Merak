import { serve } from "@hono/node-server";
import { createServerApp } from "./app.js";
import { ensureDatabaseReady } from "./db/client.js";
import { env } from "./env.js";

ensureDatabaseReady();
const { app, nodeWs } = createServerApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`[merak:server] listening on http://localhost:${info.port}`);
  },
);

nodeWs?.injectWebSocket(server);
