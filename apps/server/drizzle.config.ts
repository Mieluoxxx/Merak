import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const dataDir = process.env.DATA_DIR ?? "./data";
const dbPath = process.env.DB_PATH ?? path.join(dataDir, "merak.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: dbPath,
  },
});
