import { API_ROUTES } from "@merak/shared";
import type { Hono } from "hono";
import { getAuthContext } from "../auth/middleware.js";
import { BadRequestError } from "../services/errors.js";
import type { AppServices } from "../services/types.js";

export function mountSearchRoutes(
  app: Hono<any, any, any>,
  services: AppServices,
): void {
  app.get(API_ROUTES.search, async (c) => {
    const ctx = getAuthContext(c);
    const query = c.req.query("q") ?? "";
    const spaceId = c.req.query("spaceId") || undefined;
    const rawLimit = c.req.query("limit");

    let limit: number | undefined;
    if (rawLimit !== undefined && rawLimit !== "") {
      const parsed = Number(rawLimit);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new BadRequestError("limit must be a positive integer");
      }
      limit = parsed;
    }

    const results = await services.search.search(ctx, query, { spaceId, limit });
    return c.json(results);
  });
}
