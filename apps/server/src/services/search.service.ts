import {
  extractCanvasText,
  extractExcalidrawText,
  type NodeType,
  type SearchResultDto,
} from "@merak/shared";
import type Database from "better-sqlite3";
import { requireSpaceAccess } from "../auth/middleware.js";
import type { AuthContext, SearchService } from "./types.js";

function stripHtmlText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodyText(type: string, content: string): string {
  switch (type) {
    case "excalidraw":
      return extractExcalidrawText(content);
    case "canvas":
      return extractCanvasText(content);
    case "html":
      return stripHtmlText(content);
    default:
      return content;
  }
}

function buildFtsQuery(rawQuery: string): string | null {
  const tokens = rawQuery
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/"/g, "").trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `"${token}"*`).join(" ");
}

interface SearchRow {
  nodeId: string;
  spaceId: string;
  type: NodeType;
  title: string;
  snippet: string | null;
  rank: number;
}

export function createSearchService(
  sqlite: InstanceType<typeof Database>,
): SearchService {
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

  const deleteStmt = sqlite.prepare("DELETE FROM nodes_fts WHERE node_id = ?");
  const insertStmt = sqlite.prepare(
    "INSERT INTO nodes_fts (node_id, space_id, org_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)",
  );

  return {
    indexNode(node): void {
      const body = extractBodyText(node.type, node.content);
      deleteStmt.run(node.id);
      insertStmt.run(
        node.id,
        node.spaceId,
        node.orgId,
        node.type,
        node.title,
        body,
      );
    },

    removeNode(nodeId): void {
      deleteStmt.run(nodeId);
    },

    async search(
      ctx: AuthContext,
      query: string,
      opts?: { spaceId?: string; limit?: number },
    ): Promise<SearchResultDto[]> {
      const ftsQuery = buildFtsQuery(query);
      if (!ftsQuery) {
        return [];
      }

      if (opts?.spaceId) {
        requireSpaceAccess(ctx, opts.spaceId);
      }

      const limit = Math.min(Math.max(Math.trunc(opts?.limit ?? 20), 1), 100);
      const conditions: string[] = ["nodes_fts MATCH ?", "org_id = ?"];
      const params: Array<string | number> = [ftsQuery, ctx.orgId];

      if (opts?.spaceId) {
        conditions.push("space_id = ?");
        params.push(opts.spaceId);
      } else if (
        ctx.authType === "mcp-token" &&
        ctx.tokenScopes &&
        ctx.tokenScopes.spaceIds !== "*"
      ) {
        const allowed = ctx.tokenScopes.spaceIds;
        if (allowed.length === 0) {
          return [];
        }
        const placeholders = allowed.map(() => "?").join(", ");
        conditions.push(`space_id IN (${placeholders})`);
        params.push(...allowed);
      }

      params.push(limit);

      const sql = `
        SELECT
          node_id AS nodeId,
          space_id AS spaceId,
          type,
          title,
          snippet(nodes_fts, -1, '<mark>', '</mark>', '...', 24) AS snippet,
          bm25(nodes_fts, 0.0, 0.0, 0.0, 0.0, 2.0, 1.0) AS rank
        FROM nodes_fts
        WHERE ${conditions.join(" AND ")}
        ORDER BY rank ASC
        LIMIT ?
      `;

      const rows = sqlite.prepare(sql).all(...params) as SearchRow[];
      return rows.map((row) => ({
        nodeId: row.nodeId,
        spaceId: row.spaceId,
        type: row.type,
        title: row.title,
        snippet: row.snippet ?? "",
        rank: row.rank,
      }));
    },
  };
}
