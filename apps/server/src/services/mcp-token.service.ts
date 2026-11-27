import crypto from "node:crypto";
import {
  type CreateMcpTokenInput,
  type McpTokenDto,
  mcpTokenScopeSchema,
} from "@merak/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { MerakDb } from "../auth/index.js";
import * as schema from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "./errors.js";
import type { AuthContext, McpTokenService } from "./types.js";

type McpTokenRow = typeof schema.mcpTokens.$inferSelect;

function hashRawToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function toMcpTokenDto(row: McpTokenRow): McpTokenDto {
  const scopes = mcpTokenScopeSchema.parse(JSON.parse(row.scopesJson));
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    name: row.name,
    prefix: row.prefix,
    scopes,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export function createMcpTokenService(db: MerakDb): McpTokenService {
  return {
    async listTokens(ctx: AuthContext): Promise<McpTokenDto[]> {
      if (ctx.authType === "mcp-token") {
        throw new ForbiddenError("MCP tokens cannot list API tokens");
      }

      const rows = await db
        .select()
        .from(schema.mcpTokens)
        .where(eq(schema.mcpTokens.orgId, ctx.orgId))
        .orderBy(desc(schema.mcpTokens.createdAt));

      return rows.map(toMcpTokenDto);
    },

    async createToken(
      ctx: AuthContext,
      input: CreateMcpTokenInput,
    ): Promise<{ token: McpTokenDto; rawToken: string }> {
      if (ctx.authType === "mcp-token") {
        throw new ForbiddenError("MCP tokens cannot create new tokens");
      }

      if (input.scopes.spaceIds !== "*") {
        const uniqueIds = [...new Set(input.scopes.spaceIds)];
        const existingSpaces = await db
          .select({ id: schema.spaces.id })
          .from(schema.spaces)
          .where(
            and(
              eq(schema.spaces.orgId, ctx.orgId),
              inArray(schema.spaces.id, uniqueIds),
            ),
          );
        if (existingSpaces.length !== uniqueIds.length) {
          throw new BadRequestError("One or more scoped spaceIds do not exist in this organization");
        }
      }

      const id = `tok_${nanoid(16)}`;
      const rawToken = `mrk_${crypto.randomBytes(24).toString("base64url")}`;
      const prefix = rawToken.slice(0, 12);
      const tokenHash = hashRawToken(rawToken);
      const now = new Date().toISOString();

      const row: McpTokenRow = {
        id,
        orgId: ctx.orgId,
        userId: ctx.userId,
        name: input.name,
        prefix,
        tokenHash,
        scopesJson: JSON.stringify(input.scopes),
        lastUsedAt: null,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
        createdAt: now,
      };

      await db.insert(schema.mcpTokens).values(row);

      return {
        token: toMcpTokenDto(row),
        rawToken,
      };
    },

    async revokeToken(ctx: AuthContext, tokenId: string): Promise<void> {
      if (ctx.authType === "mcp-token") {
        throw new ForbiddenError("MCP tokens cannot revoke tokens");
      }

      const rows = await db
        .select({ id: schema.mcpTokens.id })
        .from(schema.mcpTokens)
        .where(
          and(
            eq(schema.mcpTokens.id, tokenId),
            eq(schema.mcpTokens.orgId, ctx.orgId),
          ),
        )
        .limit(1);

      if (rows.length === 0) {
        throw new NotFoundError("MCP token not found");
      }

      await db
        .update(schema.mcpTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.mcpTokens.id, tokenId),
            eq(schema.mcpTokens.orgId, ctx.orgId),
          ),
        );
    },

    async verifyRawToken(rawToken: string): Promise<AuthContext | null> {
      if (!rawToken || !rawToken.startsWith("mrk_")) {
        return null;
      }

      const tokenHash = hashRawToken(rawToken);
      const rows = await db
        .select()
        .from(schema.mcpTokens)
        .where(eq(schema.mcpTokens.tokenHash, tokenHash))
        .limit(1);

      const row = rows[0];
      if (!row) return null;
      if (row.revokedAt !== null) return null;
      if (row.expiresAt !== null) {
        const expMs = Date.parse(row.expiresAt);
        if (Number.isNaN(expMs) || expMs <= Date.now()) {
          return null;
        }
      }

      const memberships = await db
        .select({ role: schema.member.role })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, row.orgId),
            eq(schema.member.userId, row.userId),
          ),
        )
        .limit(1);

      const membership = memberships[0];
      if (!membership) {
        return null;
      }

      let parsedScopes;
      try {
        parsedScopes = mcpTokenScopeSchema.safeParse(JSON.parse(row.scopesJson));
      } catch {
        return null;
      }
      if (!parsedScopes.success) {
        return null;
      }

      await db
        .update(schema.mcpTokens)
        .set({ lastUsedAt: new Date().toISOString() })
        .where(eq(schema.mcpTokens.id, row.id));

      return {
        userId: row.userId,
        orgId: row.orgId,
        role: membership.role,
        authType: "mcp-token",
        tokenScopes: {
          spaceIds: parsedScopes.data.spaceIds,
          permission: parsedScopes.data.permission,
        },
      };
    },
  };
}
