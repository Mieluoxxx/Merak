import { and, asc, eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import * as schema from "../db/schema.js";
import { ForbiddenError, UnauthorizedError } from "../services/errors.js";
import type { AuthContext, McpTokenService } from "../services/types.js";
import type { AuthInstance, MerakDb } from "./index.js";

export interface AuthMiddlewareDeps {
  auth: AuthInstance;
  mcpTokens: McpTokenService;
  db: MerakDb;
}

export interface AuthEnv {
  Variables: {
    auth: AuthContext;
  };
}

export function canAccessSpace(ctx: AuthContext, spaceId: string): boolean {
  if (ctx.authType !== "mcp-token" || !ctx.tokenScopes) {
    return true;
  }
  if (ctx.tokenScopes.spaceIds === "*") {
    return true;
  }
  return ctx.tokenScopes.spaceIds.includes(spaceId);
}

export function requireSpaceAccess(ctx: AuthContext, spaceId: string): void {
  if (!canAccessSpace(ctx, spaceId)) {
    throw new ForbiddenError("Token does not have access to this space");
  }
}

export function requireWritePermission(ctx: AuthContext): void {
  if (ctx.authType === "mcp-token" && ctx.tokenScopes?.permission !== "write") {
    throw new ForbiddenError("Token does not have write permission");
  }
}

function extractBearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function resolveAuthFromHeaders(
  headers: Headers,
  deps: AuthMiddlewareDeps,
  opts?: { queryToken?: string | null },
): Promise<AuthContext | null> {
  const bearerToken = extractBearerToken(headers);
  if (bearerToken) {
    if (bearerToken.startsWith("mrk_")) {
      return deps.mcpTokens.verifyRawToken(bearerToken);
    }
    return null;
  }

  if (opts?.queryToken && opts.queryToken.startsWith("mrk_")) {
    return deps.mcpTokens.verifyRawToken(opts.queryToken);
  }

  const sessionResult = await deps.auth.api.getSession({ headers });
  if (!sessionResult?.user || !sessionResult.session) {
    return null;
  }

  const userId = sessionResult.user.id;
  const activeOrgId =
    (sessionResult.session as { activeOrganizationId?: string | null }).activeOrganizationId ??
    null;

  let membership:
    | {
        organizationId: string;
        role: string;
      }
    | undefined;

  if (activeOrgId) {
    const activeRows = await deps.db
      .select({
        organizationId: schema.member.organizationId,
        role: schema.member.role,
      })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, activeOrgId),
          eq(schema.member.userId, userId),
        ),
      )
      .limit(1);
    membership = activeRows[0];
  }

  if (!membership) {
    const fallbackRows = await deps.db
      .select({
        organizationId: schema.member.organizationId,
        role: schema.member.role,
      })
      .from(schema.member)
      .where(eq(schema.member.userId, userId))
      .orderBy(asc(schema.member.createdAt))
      .limit(1);
    membership = fallbackRows[0];
  }

  if (!membership) {
    return null;
  }

  return {
    userId,
    orgId: membership.organizationId,
    role: membership.role,
    authType: "session",
  };
}

export function createAuthMiddleware(deps: AuthMiddlewareDeps): MiddlewareHandler {
  return async (c, next) => {
    const ctx = await resolveAuthFromHeaders(c.req.raw.headers, deps);
    if (!ctx) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("auth", ctx);
    await next();
  };
}

export function getAuthContext(c: Context): AuthContext {
  const ctx = c.get("auth") as AuthContext | undefined;
  if (!ctx) {
    throw new UnauthorizedError("Unauthorized");
  }
  return ctx;
}
