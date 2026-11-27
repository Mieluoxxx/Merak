import type Database from "better-sqlite3";
import type { MerakDb } from "../auth/index.js";
import { db as defaultDb, sqlite as defaultSqlite } from "../db/client.js";
import { env } from "../env.js";
import { WsBroadcaster } from "../ws/broadcaster.js";
import { createMcpTokenService } from "./mcp-token.service.js";
import { createMediaService } from "./media.service.js";
import { createNodeService } from "./node.service.js";
import { createSearchService } from "./search.service.js";
import { createSpaceService } from "./space.service.js";
import type { AppServices, RealtimeBroadcaster } from "./types.js";

export interface CreateServicesDeps {
  db?: MerakDb;
  sqlite?: InstanceType<typeof Database>;
  mediaDir?: string;
  realtime?: RealtimeBroadcaster;
}

export interface CreatedAppServices extends AppServices {
  broadcaster?: WsBroadcaster;
}

export function createServices(deps?: CreateServicesDeps): CreatedAppServices {
  const dbInstance = deps?.db ?? defaultDb;
  const sqliteInstance = deps?.sqlite ?? defaultSqlite;
  const mediaDir = deps?.mediaDir ?? env.MEDIA_DIR;

  const broadcaster = deps?.realtime
    ? deps.realtime instanceof WsBroadcaster
      ? deps.realtime
      : undefined
    : new WsBroadcaster(dbInstance);

  const realtime: RealtimeBroadcaster = deps?.realtime ?? broadcaster!;

  const search = createSearchService(sqliteInstance);
  const media = createMediaService({ db: dbInstance, mediaDir, realtime });
  const spaces = createSpaceService({ db: dbInstance, search, realtime });
  const nodes = createNodeService({ db: dbInstance, search, media, realtime });
  const mcpTokens = createMcpTokenService(dbInstance);

  return {
    spaces,
    nodes,
    media,
    search,
    mcpTokens,
    realtime,
    broadcaster,
  };
}

export * from "./errors.js";
export * from "./types.js";
