import type { McpPermission } from "@merak/shared";
import type { AuthContext } from "../services/types.js";

export class McpToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
  }
}

export class McpScopeError extends McpToolError {
  constructor(message: string) {
    super("FORBIDDEN_SCOPE", message);
    this.name = "McpScopeError";
  }
}

export class McpValidationError extends McpToolError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
    this.name = "McpValidationError";
  }
}

export class McpNotFoundError extends McpToolError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "McpNotFoundError";
  }
}

/**
 * Extracts a raw Bearer token from an HTTP Authorization header.
 */
export function extractBearerToken(authorizationHeader: string | undefined | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Resolves the effective permission level for an AuthContext.
 * Fails closed to "read" if an MCP token context is missing explicit tokenScopes.
 */
export function getEffectivePermission(ctx: AuthContext): McpPermission {
  if (ctx.tokenScopes) {
    return ctx.tokenScopes.permission;
  }
  return ctx.authType === "mcp-token" ? "read" : "write";
}

/**
 * Returns true if the caller is authorized to access the given spaceId.
 * Fails closed if an MCP token context is missing explicit tokenScopes.
 */
export function isSpaceAllowed(ctx: AuthContext, spaceId: string): boolean {
  if (!ctx.tokenScopes) {
    return ctx.authType !== "mcp-token";
  }
  if (ctx.tokenScopes.spaceIds === "*") {
    return true;
  }
  return ctx.tokenScopes.spaceIds.includes(spaceId);
}

/**
 * Asserts that the caller has "write" permission before performing a mutating MCP tool.
 */
export function assertWritePermission(ctx: AuthContext, toolName: string): void {
  const permission = getEffectivePermission(ctx);
  if (permission !== "write") {
    throw new McpScopeError(
      `Insufficient scope: tool "${toolName}" requires "write" permission, but token has "${permission}" permission.`,
    );
  }
}

/**
 * Asserts that the caller is allowed to access the specified spaceId.
 */
export function assertSpaceAccess(ctx: AuthContext, spaceId: string, toolName?: string): void {
  if (!isSpaceAllowed(ctx, spaceId)) {
    const context = toolName ? ` for tool "${toolName}"` : "";
    throw new McpScopeError(
      `Access denied: token is not authorized to access space "${spaceId}"${context}.`,
    );
  }
}

/**
 * Filters Space records to only those allowed by the caller's token scope.
 */
export function filterSpacesByScope<T extends { id: string }>(ctx: AuthContext, spaces: T[]): T[] {
  return spaces.filter((space) => isSpaceAllowed(ctx, space.id));
}

/**
 * Filters records containing a `spaceId` field.
 * When `allowNullSpace` is true (e.g. org-wide media), items with `spaceId === null` are kept.
 */
export function filterBySpaceScope<T extends { spaceId: string | null }>(
  ctx: AuthContext,
  items: T[],
  options?: { allowNullSpace?: boolean },
): T[] {
  if (!ctx.tokenScopes) {
    return ctx.authType === "mcp-token" ? [] : items;
  }
  if (ctx.tokenScopes.spaceIds === "*") {
    return items;
  }
  const allowNull = options?.allowNullSpace ?? false;
  return items.filter((item) => {
    if (item.spaceId === null) return allowNull;
    return isSpaceAllowed(ctx, item.spaceId);
  });
}
