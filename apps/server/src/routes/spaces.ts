import {
  API_ROUTES,
  createSpaceInputSchema,
  spaceKindSchema,
  updateSpaceInputSchema,
} from "@merak/shared";
import type { Hono } from "hono";
import { getAuthContext } from "../auth/middleware.js";
import { BadRequestError, NotFoundError } from "../services/errors.js";
import type { AppServices } from "../services/types.js";
import { parseJsonBody } from "./validation.js";

export function mountSpaceRoutes(
  app: Hono<any, any, any>,
  services: AppServices,
): void {
  app.get(API_ROUTES.spaces, async (c) => {
    const ctx = getAuthContext(c);
    const rawKind = c.req.query("kind");
    let kind: "knowledge" | "project" | undefined;
    if (rawKind !== undefined && rawKind !== "") {
      const parsed = spaceKindSchema.safeParse(rawKind);
      if (!parsed.success) {
        throw new BadRequestError("Invalid space kind", parsed.error.issues);
      }
      kind = parsed.data;
    }

    const spaces = await services.spaces.listSpaces(ctx, kind);
    return c.json(spaces);
  });

  app.post(API_ROUTES.spaces, async (c) => {
    const ctx = getAuthContext(c);
    const input = await parseJsonBody(c, createSpaceInputSchema);
    const created = await services.spaces.createSpace(ctx, input);
    return c.json(created, 201);
  });

  app.get(`${API_ROUTES.spaces}/:spaceId/tree`, async (c) => {
    const ctx = getAuthContext(c);
    const spaceId = c.req.param("spaceId");
    const tree = await services.nodes.getTree(ctx, spaceId);
    return c.json(tree);
  });

  app.get(`${API_ROUTES.spaces}/:spaceId`, async (c) => {
    const ctx = getAuthContext(c);
    const spaceId = c.req.param("spaceId");
    const space = await services.spaces.getSpace(ctx, spaceId);
    if (!space) {
      throw new NotFoundError("Space not found");
    }
    return c.json(space);
  });

  app.patch(`${API_ROUTES.spaces}/:spaceId`, async (c) => {
    const ctx = getAuthContext(c);
    const spaceId = c.req.param("spaceId");
    const input = await parseJsonBody(c, updateSpaceInputSchema);
    const updated = await services.spaces.updateSpace(ctx, spaceId, input);
    return c.json(updated);
  });

  app.delete(`${API_ROUTES.spaces}/:spaceId`, async (c) => {
    const ctx = getAuthContext(c);
    const spaceId = c.req.param("spaceId");
    await services.spaces.deleteSpace(ctx, spaceId);
    return c.body(null, 204);
  });
}
