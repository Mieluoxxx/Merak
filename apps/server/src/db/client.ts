import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env.js";
import * as schema from "./schema.js";

fs.mkdirSync(env.DATA_DIR, { recursive: true });
fs.mkdirSync(env.MEDIA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });

export const sqlite: InstanceType<typeof Database> = new Database(env.DB_PATH);
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function ensureDatabaseReady(): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
      node_id UNINDEXED,
      space_id UNINDEXED,
      org_id UNINDEXED,
      type UNINDEXED,
      title,
      body,
      tokenize = 'unicode61'
    );
  `);
}
