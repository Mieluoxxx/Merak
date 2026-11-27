import { API_ROUTES, createMcpTokenInputSchema } from "@merak/shared";
import type { Hono } from "hono";
import { getAuthContext } from "../auth/middleware.js";
import type { AppServices } from "../services/types.js";
import { parseJsonBody } from "./validation.js";

export function mountMcpTokenRoutes(
  app: Hono<any, any, any>,
  services: AppServices,
): void {
  app.get(API_ROUTES.mcpTokens, async (c) => {
    const ctx = getAuthContext(c);
    const tokens = await services.mcpTokens.listTokens(ctx);
    return c.json(tokens);
  });

  app.post(API_ROUTES.mcpTokens, async (c) => {
    const ctx = getAuthContext(c);
    const input = await parseJsonBody(c, createMcpTokenInputSchema);
    const result = await services.mcpTokens.createToken(ctx, input);
    return c.json(result, 201);
  });

  app.delete(`${API_ROUTES.mcpTokens}/:tokenId`, async (c) => {
    const ctx = getAuthContext(c);
    const tokenId = c.req.param("tokenId");
    await services.mcpTokens.revokeToken(ctx, tokenId);
    return c.body(null, 204);
  });
}
