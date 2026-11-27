import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Hono } from "hono";
import { createApp } from "../app.js";
import { createAuth, type AuthInstance, type MerakDb } from "../auth/index.js";
import * as schema from "../db/schema.js";
import { createServices, type CreatedAppServices } from "../services/index.js";

const SCHEMA_SQL = `
CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  active_organization_id TEXT
);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE organization (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  created_at INTEGER NOT NULL,
  metadata TEXT
);

CREATE TABLE member (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX member_org_user_idx ON member (organization_id, user_id);

CREATE TABLE invitation (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  inviter_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE spaces (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  sort_order TEXT NOT NULL DEFAULT 'i',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX spaces_org_slug_idx ON spaces (org_id, slug);
CREATE INDEX spaces_org_kind_idx ON spaces (org_id, kind, sort_order);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT,
  sort_order TEXT NOT NULL DEFAULT 'i',
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX nodes_tree_idx ON nodes (space_id, parent_id, sort_order);
CREATE INDEX nodes_deleted_idx ON nodes (space_id, deleted_at);

CREATE TABLE media (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
  sha256 TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  storage_key TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX media_org_sha_idx ON media (org_id, sha256);

CREATE TABLE media_refs (
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, node_id)
);

CREATE TABLE mcp_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  node_id UNINDEXED,
  space_id UNINDEXED,
  org_id UNINDEXED,
  type UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);
`;

export interface TestEnv {
  tempDir: string;
  dbPath: string;
  mediaDir: string;
  sqlite: InstanceType<typeof Database>;
  db: MerakDb;
  auth: AuthInstance;
  services: CreatedAppServices;
  app: Hono;
  cleanup: () => void;
}

export function createTestEnv(): TestEnv {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "merak-server-test-"));
  const dbPath = path.join(tempDir, "test.db");
  const mediaDir = path.join(tempDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);

  const db = drizzle(sqlite, { schema });
  const auth = createAuth(db, {
    secret: "test-secret-key-at-least-32-characters-long",
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000", "http://localhost:5173"],
  });
  const services = createServices({ db, sqlite, mediaDir });
  const app = createApp({ db, sqlite, auth, services });

  return {
    tempDir,
    dbPath,
    mediaDir,
    sqlite,
    db,
    auth,
    services,
    app,
    cleanup: () => {
      try {
        sqlite.close();
      } catch {
        // already closed
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function extractCookieHeader(res: Response): string {
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter((v): v is string => Boolean(v));

  return setCookies
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter((v): v is string => Boolean(v))
    .join("; ");
}

export async function signUpUser(
  app: Hono,
  input: { name: string; email: string; password: string },
): Promise<{
  user: { id: string; email: string; name: string };
  cookie: string;
}> {
  const res = await app.request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(input),
  });

  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Sign-up failed (${res.status}): ${body}`);
  }

  const cookie = extractCookieHeader(res);
  const data = (await res.json()) as {
    user: { id: string; email: string; name: string };
  };
  return { user: data.user, cookie };
}
