import { z } from "zod";

export const spaceVisibilitySchema = z.enum(["shared", "private"]);
export type SpaceVisibility = z.infer<typeof spaceVisibilitySchema>;

export const spaceDtoSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  visibility: spaceVisibilitySchema,
  ownerUserId: z.string().nullable(),
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
  visibility: spaceVisibilitySchema.default("private"),
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
  visibility: spaceVisibilitySchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  icon: z.string().trim().max(64).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.string().min(1).max(128).optional(),
});
export type UpdateSpaceInput = z.infer<typeof updateSpaceInputSchema>;
