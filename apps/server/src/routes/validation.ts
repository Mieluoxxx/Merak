import type { Context } from "hono";
import type { z } from "zod";
import { BadRequestError } from "../services/errors.js";

export async function parseJsonBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new BadRequestError("Invalid JSON request body");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError("Validation failed", parsed.error.issues);
  }
  return parsed.data;
}
