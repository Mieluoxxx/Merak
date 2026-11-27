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

    CREATE TABLE IF NOT EXISTS comment_threads (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      block_index INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      quote TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      resolved_by TEXT REFERENCES user(id) ON DELETE SET NULL,
      resolved_at TEXT,
      created_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS comment_threads_node_idx
      ON comment_threads(node_id, status, block_index);

    CREATE TABLE IF NOT EXISTS comment_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS comment_messages_thread_idx
      ON comment_messages(thread_id, created_at);
  `);
}
