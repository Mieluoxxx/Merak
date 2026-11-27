import { z } from "zod";

export const mediaDtoSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  spaceId: z.string().nullable(),
  sha256: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  url: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type MediaDto = z.infer<typeof mediaDtoSchema>;

export const mediaWithRefsDtoSchema = mediaDtoSchema.extend({
  refNodeIds: z.array(z.string()),
  refCount: z.number().int().nonnegative(),
});
export type MediaWithRefsDto = z.infer<typeof mediaWithRefsDtoSchema>;

const MEDIA_URL_REGEX = /\/api\/media\/([A-Za-z0-9_-]+)/g;

export function extractMediaIdsFromContent(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(MEDIA_URL_REGEX)) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids];
}
