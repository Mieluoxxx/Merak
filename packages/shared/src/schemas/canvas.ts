import { z } from "zod";

const canvasColorSchema = z.string().min(1).max(32).optional();

const canvasBaseNodeSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  color: canvasColorSchema,
});

export const canvasTextNodeSchema = canvasBaseNodeSchema.extend({
  type: z.literal("text"),
  text: z.string(),
});

export const canvasFileNodeSchema = canvasBaseNodeSchema.extend({
  type: z.literal("file"),
  file: z.string().min(1),
  subpath: z.string().optional(),
  // Optional Merak extensions linking directly to a Node or Media record.
  nodeId: z.string().optional(),
  mediaId: z.string().optional(),
});

export const canvasLinkNodeSchema = canvasBaseNodeSchema.extend({
  type: z.literal("link"),
  url: z.string().url(),
});

export const canvasGroupNodeSchema = canvasBaseNodeSchema.extend({
  type: z.literal("group"),
  label: z.string().optional(),
  background: z.string().optional(),
  backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
});

export const canvasNodeSchema = z.discriminatedUnion("type", [
  canvasTextNodeSchema,
  canvasFileNodeSchema,
  canvasLinkNodeSchema,
  canvasGroupNodeSchema,
]);
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

const canvasSideSchema = z.enum(["top", "right", "bottom", "left"]);
const canvasEndSchema = z.enum(["none", "arrow"]);

export const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  fromNode: z.string().min(1),
  fromSide: canvasSideSchema.optional(),
  fromEnd: canvasEndSchema.optional(),
  toNode: z.string().min(1),
  toSide: canvasSideSchema.optional(),
  toEnd: canvasEndSchema.optional(),
  color: canvasColorSchema,
  label: z.string().optional(),
});
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;

export const jsonCanvasDocumentSchema = z.object({
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
});
export type JsonCanvasDocument = z.infer<typeof jsonCanvasDocumentSchema>;

export function extractCanvasText(contentJson: string): string {
  try {
    const parsed = jsonCanvasDocumentSchema.safeParse(JSON.parse(contentJson));
    if (!parsed.success) return "";
    const chunks: string[] = [];
    for (const node of parsed.data.nodes) {
      if (node.type === "text" && node.text.trim()) chunks.push(node.text.trim());
      if (node.type === "group" && node.label?.trim()) chunks.push(node.label.trim());
      if (node.type === "file") chunks.push(node.file);
      if (node.type === "link") chunks.push(node.url);
    }
    for (const edge of parsed.data.edges) {
      if (edge.label?.trim()) chunks.push(edge.label.trim());
    }
    return chunks.join("\n");
  } catch {
    return "";
  }
}
