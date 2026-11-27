import { z } from "zod";

export const spaceKindSchema = z.enum(["knowledge", "project"]);
export type SpaceKind = z.infer<typeof spaceKindSchema>;

export const spaceDtoSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  kind: spaceKindSchema,
  slug: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  description: z.string().nullable(),
  sortOrder: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SpaceDto = z.infer<typeof spaceDtoSchema>;

export const createSpaceInputSchema = z.object({
  kind: spaceKindSchema,
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  icon: z.string().trim().max(64).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});
export type CreateSpaceInput = z.infer<typeof createSpaceInputSchema>;

export const updateSpaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  icon: z.string().trim().max(64).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.string().min(1).max(128).optional(),
});
export type UpdateSpaceInput = z.infer<typeof updateSpaceInputSchema>;
