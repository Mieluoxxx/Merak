import { nanoid } from "nanoid";
import { z } from "zod";

const bindingSchema = z
  .object({
    elementId: z.string(),
    focus: z.number().optional(),
    gap: z.number().optional(),
    fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
  })
  .passthrough();

export const excalidrawElementInputSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum([
      "rectangle",
      "diamond",
      "ellipse",
      "arrow",
      "line",
      "freedraw",
      "text",
      "image",
      "frame",
      "magicframe",
    ]),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    fontFamily: z.number().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    strokeColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    fillStyle: z.enum(["hachure", "cross-hatch", "solid", "zigzag"]).optional(),
    strokeWidth: z.number().optional(),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    roughness: z.number().optional(),
    opacity: z.number().min(0).max(100).optional(),
    angle: z.number().optional(),
    points: z.array(z.tuple([z.number(), z.number()])).optional(),
    startBinding: bindingSchema.nullable().optional(),
    endBinding: bindingSchema.nullable().optional(),
    boundElements: z
      .array(z.object({ id: z.string(), type: z.enum(["arrow", "text"]) }))
      .nullable()
      .optional(),
    groupIds: z.array(z.string()).optional(),
    frameId: z.string().nullable().optional(),
    roundness: z
      .object({ type: z.number(), value: z.number().optional() })
      .nullable()
      .optional(),
    fileId: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
    locked: z.boolean().optional(),
  })
  .passthrough();
export type ExcalidrawElementInput = z.infer<typeof excalidrawElementInputSchema>;

export const excalidrawDocumentInputSchema = z.object({
  type: z.literal("excalidraw").optional(),
  version: z.number().int().optional(),
  source: z.string().optional(),
  elements: z.array(excalidrawElementInputSchema),
  appState: z.record(z.string(), z.unknown()).optional(),
  files: z.record(z.string(), z.unknown()).optional(),
});
export type ExcalidrawDocumentInput = z.infer<typeof excalidrawDocumentInputSchema>;

export const excalidrawDocumentSchema = z.object({
  type: z.literal("excalidraw"),
  version: z.literal(2),
  source: z.string(),
  elements: z.array(z.record(z.string(), z.unknown())),
  appState: z.record(z.string(), z.unknown()),
  files: z.record(z.string(), z.unknown()),
});
export type ExcalidrawDocument = z.infer<typeof excalidrawDocumentSchema>;

function deterministicSeed(index: number): number {
  return ((index + 1) * 2654435761) >>> 0;
}

export function normalizeExcalidrawDocument(
  rawInput: unknown,
): ExcalidrawDocument {
  const parsed = excalidrawDocumentInputSchema.parse(rawInput);
  const now = Date.now();

  // First pass: assign stable IDs so binding validation can verify targets.
  const withIds = parsed.elements.map((el) => ({
    ...el,
    id: el.id && el.id.length > 0 ? el.id : nanoid(12),
  }));
  const validIds = new Set(withIds.map((el) => el.id));

  const elements = withIds.map((el, index) => {
    const startBinding =
      el.startBinding && validIds.has(el.startBinding.elementId)
        ? {
            focus: 0,
            gap: 4,
            ...el.startBinding,
          }
        : null;
    const endBinding =
      el.endBinding && validIds.has(el.endBinding.elementId)
        ? {
            focus: 0,
            gap: 4,
            ...el.endBinding,
          }
        : null;

    const boundElements = el.boundElements
      ? el.boundElements.filter((b) => validIds.has(b.id))
      : null;

    const defaultWidth =
      el.type === "arrow" || el.type === "line" ? 100 : el.type === "text" ? 160 : 180;
    const defaultHeight =
      el.type === "arrow" || el.type === "line" ? 0 : el.type === "text" ? 32 : 80;

    const base = {
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid" as const,
      strokeWidth: 2,
      strokeStyle: "solid" as const,
      roughness: 1,
      opacity: 100,
      angle: 0,
      width: el.width ?? defaultWidth,
      height: el.height ?? defaultHeight,
      seed: deterministicSeed(index),
      version: 1,
      versionNonce: deterministicSeed(index + 997),
      isDeleted: false,
      groupIds: el.groupIds ?? [],
      frameId: el.frameId ?? null,
      roundness:
        el.roundness !== undefined
          ? el.roundness
          : el.type === "rectangle"
            ? { type: 3 }
            : null,
      boundElements,
      updated: now,
      link: el.link ?? null,
      locked: el.locked ?? false,
      ...el,
      id: el.id,
      startBinding,
      endBinding,
    };

    if ((el.type === "arrow" || el.type === "line") && !el.points) {
      return {
        ...base,
        points: [
          [0, 0],
          [base.width, base.height],
        ],
      };
    }

    if (el.type === "text") {
      return {
        ...base,
        text: el.text ?? "",
        originalText: el.text ?? "",
        fontSize: el.fontSize ?? 18,
        fontFamily: el.fontFamily ?? 1,
        textAlign: el.textAlign ?? "left",
        verticalAlign: el.verticalAlign ?? "top",
        lineHeight: 1.25,
      };
    }

    return base;
  });

  return {
    type: "excalidraw",
    version: 2,
    source: parsed.source ?? "https://merak.local",
    elements,
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: 20,
      ...parsed.appState,
    },
    files: parsed.files ?? {},
  };
}

export function extractExcalidrawText(contentJson: string): string {
  try {
    const parsed = JSON.parse(contentJson) as {
      elements?: Array<{ type?: string; text?: string; isDeleted?: boolean }>;
    };
    if (!Array.isArray(parsed.elements)) return "";
    return parsed.elements
      .filter((el) => !el.isDeleted && typeof el.text === "string" && el.text.trim().length > 0)
      .map((el) => el.text!.trim())
      .join("\n");
  } catch {
    return "";
  }
}
