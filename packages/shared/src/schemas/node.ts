import { z } from "zod";

export const nodeTypeSchema = z.enum(["doc", "excalidraw", "html", "canvas"]);
export type NodeType = z.infer<typeof nodeTypeSchema>;

export const nodeSummaryDtoSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  parentId: z.string().nullable(),
  type: nodeTypeSchema,
  title: z.string(),
  icon: z.string().nullable(),
  sortOrder: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  hasChildren: z.boolean().optional(),
});
export type NodeSummaryDto = z.infer<typeof nodeSummaryDtoSchema>;

export const nodeDetailDtoSchema = nodeSummaryDtoSchema.extend({
  content: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  deletedAt: z.string().nullable(),
});
export type NodeDetailDto = z.infer<typeof nodeDetailDtoSchema>;

export interface NodeTreeItemDto extends NodeSummaryDto {
  children: NodeTreeItemDto[];
}

export const nodeTreeItemDtoSchema: z.ZodType<NodeTreeItemDto> =
  nodeSummaryDtoSchema.extend({
    children: z.lazy(() => z.array(nodeTreeItemDtoSchema)),
  });

export const createNodeInputSchema = z.object({
  spaceId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  type: nodeTypeSchema,
  title: z.string().trim().min(1).max(200),
  icon: z.string().trim().max(64).nullable().optional(),
  content: z.string().optional(),
  sortOrder: z.string().min(1).max(128).optional(),
});
export type CreateNodeInput = z.infer<typeof createNodeInputSchema>;

export const updateNodeInputSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  icon: z.string().trim().max(64).nullable().optional(),
  content: z.string().optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export type UpdateNodeInput = z.infer<typeof updateNodeInputSchema>;

export const patchDocInputSchema = z.object({
  oldText: z.string().min(1),
  newText: z.string(),
  replaceAll: z.boolean().optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export type PatchDocInput = z.infer<typeof patchDocInputSchema>;

export const moveNodeInputSchema = z.object({
  parentId: z.string().min(1).nullable(),
  sortOrder: z.string().min(1).max(128),
});
export type MoveNodeInput = z.infer<typeof moveNodeInputSchema>;

export const searchResultDtoSchema = z.object({
  nodeId: z.string(),
  spaceId: z.string(),
  type: nodeTypeSchema,
  title: z.string(),
  snippet: z.string(),
  rank: z.number(),
});
export type SearchResultDto = z.infer<typeof searchResultDtoSchema>;
