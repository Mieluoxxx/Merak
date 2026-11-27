import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppServices, AuthContext } from "../services/types.js";
import { registerMcpResources } from "./resources.js";
import { registerMcpTools } from "./tools.js";

export const MERAK_MCP_SERVER_INFO = {
  name: "merak-mcp",
  version: "0.1.0",
} as const;

/**
 * Instantiates a fresh McpServer bound to the authenticated caller's AuthContext
 * and registers all Merak tools and UI SDK discovery resources.
 */
export function createMerakMcpServer(services: AppServices, ctx: AuthContext): McpServer {
  const server = new McpServer(MERAK_MCP_SERVER_INFO, {
    capabilities: {
      tools: {},
      resources: {},
    },
  });

  registerMcpResources(server);
  registerMcpTools(server, services, ctx);

  return server;
}
