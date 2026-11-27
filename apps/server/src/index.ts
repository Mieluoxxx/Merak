import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { ensureDatabaseReady } from "./db/client.js";
import { env } from "./env.js";

ensureDatabaseReady();
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`[merak:server] listening on http://localhost:${info.port}`);
  },
);
