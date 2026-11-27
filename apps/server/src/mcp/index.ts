import { API_ROUTES } from "@merak/shared";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";
import type { AppServices } from "../services/types.js";
import { extractBearerToken } from "./scopes.js";
import { createMerakMcpServer } from "./server.js";

const MAX_MCP_REQUEST_BODY_BYTES = 16 * 1024 * 1024; // 16 MiB (accommodates base64 upload_media payloads)

function jsonRpcErrorResponse(
  status: number,
  code: number,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...extraHeaders,
      },
    },
  );
}

/**
 * Mounts Merak's stateless Streamable HTTP MCP server at `API_ROUTES.mcp` (`/mcp`).
 * Authenticates every request via `Authorization: Bearer mrk_...` through
 * `services.mcpTokens.verifyRawToken` and enforces token scopes across all tools.
 */
export function mountMcpRoutes(app: Hono, services: AppServices): void {
  app.all(API_ROUTES.mcp, async (c) => {
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: "POST, DELETE, OPTIONS",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
        },
      });
    }

    const rawToken = extractBearerToken(c.req.header("authorization"));
    if (!rawToken) {
      return jsonRpcErrorResponse(
        401,
        -32001,
        'Unauthorized: missing or invalid "Authorization: Bearer <token>" header.',
        { "WWW-Authenticate": 'Bearer realm="merak-mcp"' },
      );
    }

    const authCtx = await services.mcpTokens.verifyRawToken(rawToken);
    if (!authCtx) {
      return jsonRpcErrorResponse(
        401,
        -32001,
        "Unauthorized: MCP token is invalid, expired, or revoked.",
        { "WWW-Authenticate": 'Bearer realm="merak-mcp", error="invalid_token"' },
      );
    }

    // Stateless Streamable HTTP servers do not expose persistent standalone GET SSE streams.
    if (c.req.method === "GET") {
      return jsonRpcErrorResponse(
        405,
        -32000,
        "Method Not Allowed: stateless MCP endpoint does not offer standalone GET SSE streams.",
        { Allow: "POST, DELETE" },
      );
    }

    const server = createMerakMcpServer(services, authCtx);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_MCP_REQUEST_BODY_BYTES,
    });

    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
      await transport.close();
    }
  });
}

export {
  UI_SDK_CSS_RESOURCE_URI,
  UI_SDK_MANIFEST_RESOURCE_URI,
  registerMcpResources,
} from "./resources.js";
export {
  McpNotFoundError,
  McpScopeError,
  McpToolError,
  McpValidationError,
  assertSpaceAccess,
  assertWritePermission,
  extractBearerToken,
  filterBySpaceScope,
  filterSpacesByScope,
  getEffectivePermission,
  isSpaceAllowed,
} from "./scopes.js";
export { MERAK_MCP_SERVER_INFO, createMerakMcpServer } from "./server.js";
export { registerMcpTools } from "./tools.js";
