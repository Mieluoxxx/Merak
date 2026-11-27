import type { MerakFlowEdge, MerakFlowNode } from "./canvasHelpers.js";

export interface CanvasNodeColorOption {
  id: string;
  label: string;
  dot: string;
  border: string;
  tint: string;
}

export const CANVAS_NODE_COLORS: readonly CanvasNodeColorOption[] = [
  { id: "default", label: "Default", dot: "#78716c", border: "", tint: "" },
  {
    id: "gray",
    label: "Gray",
    dot: "#9b9a97",
    border: "#6f6e6b",
    tint: "rgba(155, 154, 151, 0.12)",
  },
  {
    id: "red",
    label: "Red",
    dot: "#e16259",
    border: "#c44d44",
    tint: "rgba(225, 98, 89, 0.14)",
  },
  {
    id: "orange",
    label: "Orange",
    dot: "#d9822b",
    border: "#b86b1e",
    tint: "rgba(217, 130, 43, 0.14)",
  },
  {
    id: "yellow",
    label: "Yellow",
    dot: "#dfab01",
    border: "#b58b06",
    tint: "rgba(223, 171, 1, 0.14)",
  },
  {
    id: "green",
    label: "Green",
    dot: "#4dab9a",
    border: "#3b8a7b",
    tint: "rgba(77, 171, 154, 0.14)",
  },
  {
    id: "blue",
    label: "Blue",
    dot: "#4e94ec",
    border: "#3b76c2",
    tint: "rgba(78, 148, 236, 0.14)",
  },
  {
    id: "purple",
    label: "Purple",
    dot: "#9a6dd7",
    border: "#7952b3",
    tint: "rgba(154, 109, 215, 0.14)",
  },
];

const JSON_CANVAS_PRESET_MAP: Record<string, string> = {
  "1": "red",
  "2": "orange",
  "3": "yellow",
  "4": "green",
  "5": "blue",
  "6": "purple",
};

export function resolveCanvasNodeColor(
  color?: string,
): { border: string; tint: string; dot: string } | null {
  if (!color || color === "default") return null;
  const normalized = JSON_CANVAS_PRESET_MAP[color] ?? color.toLowerCase();
  const found = CANVAS_NODE_COLORS.find((item) => item.id === normalized);
  if (found && found.border) {
    return { border: found.border, tint: found.tint, dot: found.dot };
  }
  if (/^#[0-9a-f]{3,8}$/i.test(color)) {
    return {
      border: color,
      tint: `${color}1f`,
      dot: color,
    };
  }
  return null;
}

export type CanvasGridMode = "dots" | "lines" | "blank";

export const CANVAS_GRID_STORAGE_KEY = "merak:canvas-grid";

export function loadCanvasGridMode(): CanvasGridMode {
  try {
    const raw = window.localStorage.getItem(CANVAS_GRID_STORAGE_KEY);
    if (raw === "lines" || raw === "blank" || raw === "dots") return raw;
    return "dots";
  } catch {
    return "dots";
  }
}

export function saveCanvasGridMode(mode: CanvasGridMode): void {
  try {
    window.localStorage.setItem(CANVAS_GRID_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota errors in restricted environments.
  }
}

export interface CanvasBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function readNodeSize(node: MerakFlowNode): { width: number; height: number } {
  const defaultW = node.data.canvasType === "group" ? 420 : 280;
  const defaultH = node.data.canvasType === "group" ? 280 : 160;
  const w =
    typeof node.measured?.width === "number" && node.measured.width > 0
      ? node.measured.width
      : typeof node.width === "number" && node.width > 0
        ? node.width
        : typeof node.style?.width === "number" && node.style.width > 0
          ? node.style.width
          : defaultW;
  const h =
    typeof node.measured?.height === "number" && node.measured.height > 0
      ? node.measured.height
      : typeof node.height === "number" && node.height > 0
        ? node.height
        : typeof node.style?.height === "number" && node.style.height > 0
          ? node.style.height
          : defaultH;
  return { width: w, height: h };
}

export function computeNodesBounds(nodes: readonly MerakFlowNode[]): CanvasBounds | null {
  if (nodes.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const { width, height } = readNodeSize(node);
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + width);
    bottom = Math.max(bottom, node.position.y + height);
  }

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function createGroupForNodes(
  nodes: readonly MerakFlowNode[],
  selectedIds: readonly string[],
  groupId: string,
): MerakFlowNode[] {
  const idSet = new Set(selectedIds);
  const targets = nodes.filter(
    (node) => idSet.has(node.id) && node.type !== "canvasGroup",
  );
  const bounds = computeNodesBounds(targets);
  if (!bounds) return [...nodes];

  const padX = 36;
  const padTop = 48;
  const padBottom = 36;
  const x = Math.round(bounds.left - padX);
  const y = Math.round(bounds.top - padTop);
  const width = Math.max(240, Math.round(bounds.width + padX * 2));
  const height = Math.max(160, Math.round(bounds.height + padTop + padBottom));

  const groupNode: MerakFlowNode = {
    id: groupId,
    type: "canvasGroup",
    zIndex: -1,
    selected: true,
    position: { x, y },
    width,
    height,
    style: { width, height },
    data: {
      canvasType: "group",
      label: "Group",
    },
  };

  return [
    groupNode,
    ...nodes.map((node) => ({ ...node, selected: false })),
  ];
}

export function ungroupNode(
  nodes: readonly MerakFlowNode[],
  groupId: string,
): MerakFlowNode[] {
  return nodes.filter((node) => !(node.id === groupId && node.type === "canvasGroup"));
}

export function duplicateCanvasSelection(
  nodes: readonly MerakFlowNode[],
  edges: readonly MerakFlowEdge[],
  selectedIds: readonly string[],
  idFactory: (prefix: string) => string,
): {
  nodes: MerakFlowNode[];
  edges: MerakFlowEdge[];
  duplicatedIds: string[];
} {
  const idSet = new Set(selectedIds);
  const idMap = new Map<string, string>();
  const clonedNodes: MerakFlowNode[] = [];
  const duplicatedIds: string[] = [];

  for (const node of nodes) {
    if (!idSet.has(node.id)) continue;
    const prefix = node.data.canvasType;
    const nextId = idFactory(prefix);
    idMap.set(node.id, nextId);
    duplicatedIds.push(nextId);
    clonedNodes.push({
      ...node,
      id: nextId,
      selected: true,
      position: {
        x: Math.round(node.position.x + 32),
        y: Math.round(node.position.y + 32),
      },
      data: { ...node.data },
      ...(node.style ? { style: { ...node.style } } : {}),
    });
  }

  if (clonedNodes.length === 0) {
    return {
      nodes: [...nodes],
      edges: [...edges],
      duplicatedIds: [],
    };
  }

  const clonedEdges: MerakFlowEdge[] = [];
  for (const edge of edges) {
    const nextSource = idMap.get(edge.source);
    const nextTarget = idMap.get(edge.target);
    if (!nextSource || !nextTarget) continue;
    clonedEdges.push({
      ...edge,
      id: idFactory("edge"),
      source: nextSource,
      target: nextTarget,
      selected: false,
      ...(edge.data ? { data: { ...edge.data } } : {}),
    });
  }

  const deselectedExisting = nodes.map((node) =>
    node.selected ? { ...node, selected: false } : node,
  );
  const groupClones = clonedNodes.filter((n) => n.type === "canvasGroup");
  const contentClones = clonedNodes.filter((n) => n.type !== "canvasGroup");

  return {
    nodes: [...groupClones, ...deselectedExisting, ...contentClones],
    edges: [...edges, ...clonedEdges],
    duplicatedIds,
  };
}

export interface CanvasHistoryState {
  past: string[];
  present: string;
  future: string[];
}

export const CANVAS_HISTORY_LIMIT = 50;

export function createCanvasHistory(initialSnapshot: string): CanvasHistoryState {
  return {
    past: [],
    present: initialSnapshot,
    future: [],
  };
}

export function pushCanvasHistory(
  history: CanvasHistoryState,
  nextSnapshot: string,
): CanvasHistoryState {
  if (nextSnapshot === history.present) {
    return history;
  }
  const nextPast = [...history.past, history.present];
  const trimmedPast =
    nextPast.length > CANVAS_HISTORY_LIMIT
      ? nextPast.slice(nextPast.length - CANVAS_HISTORY_LIMIT)
      : nextPast;
  return {
    past: trimmedPast,
    present: nextSnapshot,
    future: [],
  };
}

export function undoCanvasHistory(history: CanvasHistoryState): CanvasHistoryState {
  if (history.past.length === 0) {
    return history;
  }
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoCanvasHistory(history: CanvasHistoryState): CanvasHistoryState {
  if (history.future.length === 0) {
    return history;
  }
  const next = history.future[0];
  if (next === undefined) {
    return history;
  }
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
