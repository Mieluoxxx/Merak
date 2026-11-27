import {
  type CanvasEdge,
  type CanvasNode,
  type JsonCanvasDocument,
  jsonCanvasDocumentSchema,
} from "@merak/shared";
import { MarkerType, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";

export const CANVAS_LOD_ZOOM_THRESHOLD = 0.65;

export type CanvasSide = NonNullable<CanvasEdge["fromSide"]>;
export type CanvasEnd = NonNullable<CanvasEdge["toEnd"]>;

export interface CanvasTextFlowData extends Record<string, unknown> {
  canvasType: "text";
  text: string;
  color?: string;
}

export interface CanvasGroupFlowData extends Record<string, unknown> {
  canvasType: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
  color?: string;
}

export interface CanvasLinkFlowData extends Record<string, unknown> {
  canvasType: "link";
  url: string;
  color?: string;
}

export interface CanvasFileFlowData extends Record<string, unknown> {
  canvasType: "file";
  file: string;
  subpath?: string;
  nodeId?: string;
  mediaId?: string;
  color?: string;
}

export type MerakFlowNodeData =
  | CanvasTextFlowData
  | CanvasGroupFlowData
  | CanvasLinkFlowData
  | CanvasFileFlowData;

export type MerakFlowNodeType = "canvasText" | "canvasGroup" | "canvasLink" | "canvasFile";

export type MerakFlowNode = FlowNode<MerakFlowNodeData, MerakFlowNodeType>;

export interface MerakFlowEdgeData extends Record<string, unknown> {
  color?: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toEnd?: CanvasEnd;
}

export type MerakFlowEdge = FlowEdge<MerakFlowEdgeData>;

const CANVAS_SIDES: ReadonlySet<string> = new Set(["top", "right", "bottom", "left"]);

function parseHandleSide(handleId: string | null | undefined): CanvasSide | undefined {
  if (!handleId) return undefined;
  const cleaned = handleId.replace(/^(source|target)-/, "");
  return CANVAS_SIDES.has(cleaned) ? (cleaned as CanvasSide) : undefined;
}

export function shouldActivateCanvasLod(zoom: number, isActivated: boolean): boolean {
  return isActivated && Number.isFinite(zoom) && zoom >= CANVAS_LOD_ZOOM_THRESHOLD;
}

export function parseCanvasContent(rawContent: string): JsonCanvasDocument {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return { nodes: [], edges: [] };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    const validated = jsonCanvasDocumentSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    return { nodes: [], edges: [] };
  } catch {
    return { nodes: [], edges: [] };
  }
}

function toFlowNode(node: CanvasNode): MerakFlowNode {
  const base = {
    id: node.id,
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    style: {
      width: node.width,
      height: node.height,
    },
  };

  switch (node.type) {
    case "text":
      return {
        ...base,
        type: "canvasText",
        data: {
          canvasType: "text",
          text: node.text,
          ...(node.color ? { color: node.color } : {}),
        },
      };
    case "group":
      return {
        ...base,
        type: "canvasGroup",
        zIndex: -1,
        data: {
          canvasType: "group",
          ...(node.label !== undefined ? { label: node.label } : {}),
          ...(node.background !== undefined ? { background: node.background } : {}),
          ...(node.backgroundStyle !== undefined
            ? { backgroundStyle: node.backgroundStyle }
            : {}),
          ...(node.color ? { color: node.color } : {}),
        },
      };
    case "link":
      return {
        ...base,
        type: "canvasLink",
        data: {
          canvasType: "link",
          url: node.url,
          ...(node.color ? { color: node.color } : {}),
        },
      };
    case "file":
      return {
        ...base,
        type: "canvasFile",
        data: {
          canvasType: "file",
          file: node.file,
          ...(node.subpath !== undefined ? { subpath: node.subpath } : {}),
          ...(node.nodeId !== undefined ? { nodeId: node.nodeId } : {}),
          ...(node.mediaId !== undefined ? { mediaId: node.mediaId } : {}),
          ...(node.color ? { color: node.color } : {}),
        },
      };
  }
}

function toFlowEdge(edge: CanvasEdge): MerakFlowEdge {
  const toEnd: CanvasEnd = edge.toEnd ?? "arrow";
  const fromEnd: CanvasEnd = edge.fromEnd ?? "none";

  return {
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    ...(edge.fromSide ? { sourceHandle: `source-${edge.fromSide}` } : {}),
    ...(edge.toSide ? { targetHandle: `target-${edge.toSide}` } : {}),
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.color ? { style: { stroke: edge.color } } : {}),
    ...(toEnd === "arrow"
      ? {
          markerEnd: {
            type: MarkerType.ArrowClosed,
            ...(edge.color ? { color: edge.color } : {}),
          },
        }
      : {}),
    ...(fromEnd === "arrow"
      ? {
          markerStart: {
            type: MarkerType.ArrowClosed,
            ...(edge.color ? { color: edge.color } : {}),
          },
        }
      : {}),
    data: {
      ...(edge.color ? { color: edge.color } : {}),
      ...(edge.fromSide ? { fromSide: edge.fromSide } : {}),
      ...(edge.toSide ? { toSide: edge.toSide } : {}),
      fromEnd,
      toEnd,
    },
  };
}

/**
 * Converts a JSON Canvas 1.0 document into `@xyflow/react` nodes and edges.
 * Groups are ordered first so they sit beneath cards cleanly.
 */
export function canvasDocumentToFlow(doc: JsonCanvasDocument): {
  nodes: MerakFlowNode[];
  edges: MerakFlowEdge[];
} {
  const groupNodes = doc.nodes.filter((n) => n.type === "group").map(toFlowNode);
  const contentNodes = doc.nodes.filter((n) => n.type !== "group").map(toFlowNode);
  const edges = doc.edges.map(toFlowEdge);

  return {
    nodes: [...groupNodes, ...contentNodes],
    edges,
  };
}

function resolveDimension(
  measured: number | undefined,
  explicit: number | undefined,
  styleVal: string | number | undefined,
  fallback: number,
): number {
  const numericStyle = typeof styleVal === "number" ? styleVal : Number(styleVal);
  const candidate =
    typeof measured === "number" && measured > 0
      ? measured
      : typeof explicit === "number" && explicit > 0
        ? explicit
        : Number.isFinite(numericStyle) && numericStyle > 0
          ? numericStyle
          : fallback;
  return Math.max(40, Math.round(candidate));
}

function fromFlowNode(node: MerakFlowNode): CanvasNode {
  const defaultWidth = node.data.canvasType === "group" ? 420 : 280;
  const defaultHeight = node.data.canvasType === "group" ? 280 : 160;
  const width = resolveDimension(
    node.measured?.width,
    node.width,
    node.style?.width,
    defaultWidth,
  );
  const height = resolveDimension(
    node.measured?.height,
    node.height,
    node.style?.height,
    defaultHeight,
  );
  const base = {
    id: node.id,
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    width,
    height,
    ...(node.data.color ? { color: node.data.color } : {}),
  };

  switch (node.data.canvasType) {
    case "text":
      return {
        ...base,
        type: "text",
        text: node.data.text,
      };
    case "group":
      return {
        ...base,
        type: "group",
        ...(node.data.label !== undefined ? { label: node.data.label } : {}),
        ...(node.data.background !== undefined ? { background: node.data.background } : {}),
        ...(node.data.backgroundStyle !== undefined
          ? { backgroundStyle: node.data.backgroundStyle }
          : {}),
      };
    case "link":
      return {
        ...base,
        type: "link",
        url: node.data.url,
      };
    case "file":
      return {
        ...base,
        type: "file",
        file: node.data.file,
        ...(node.data.subpath !== undefined ? { subpath: node.data.subpath } : {}),
        ...(node.data.nodeId !== undefined ? { nodeId: node.data.nodeId } : {}),
        ...(node.data.mediaId !== undefined ? { mediaId: node.data.mediaId } : {}),
      };
  }
}

function fromFlowEdge(edge: MerakFlowEdge): CanvasEdge {
  const fromSide = parseHandleSide(edge.sourceHandle) ?? edge.data?.fromSide;
  const toSide = parseHandleSide(edge.targetHandle) ?? edge.data?.toSide;
  const fromEnd = edge.data?.fromEnd ?? (edge.markerStart ? "arrow" : undefined);
  const toEnd = edge.data?.toEnd ?? (edge.markerEnd ? "arrow" : undefined);
  const color =
    edge.data?.color ??
    (typeof edge.style?.stroke === "string" && edge.style.stroke.length > 0
      ? edge.style.stroke
      : undefined);
  const label = typeof edge.label === "string" && edge.label.length > 0 ? edge.label : undefined;

  return {
    id: edge.id,
    fromNode: edge.source,
    toNode: edge.target,
    ...(fromSide ? { fromSide } : {}),
    ...(toSide ? { toSide } : {}),
    ...(fromEnd ? { fromEnd } : {}),
    ...(toEnd ? { toEnd } : {}),
    ...(color ? { color } : {}),
    ...(label ? { label } : {}),
  };
}

/**
 * Converts `@xyflow/react` nodes and edges back into a validated JSON Canvas 1.0 document.
 */
export function flowToCanvasDocument(
  nodes: readonly MerakFlowNode[],
  edges: readonly MerakFlowEdge[],
): JsonCanvasDocument {
  const canvasNodes = nodes.map(fromFlowNode);
  const validNodeIds = new Set(canvasNodes.map((n) => n.id));
  const canvasEdges = edges
    .filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target))
    .map(fromFlowEdge);

  return jsonCanvasDocumentSchema.parse({
    nodes: canvasNodes,
    edges: canvasEdges,
  });
}
