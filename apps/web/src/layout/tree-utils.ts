import {
  rankAfter,
  rankBefore,
  rankBetween,
  type NodeSummaryDto,
  type NodeTreeItemDto,
} from "@merak/shared";

export type NodeTreeInput = NodeSummaryDto & {
  children?: NodeTreeInput[];
};

export type DropIntent = "before" | "inside" | "after";

export interface FlattenedTreeRow {
  node: NodeTreeItemDto;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
}

export interface MoveNodePlan {
  nodeId: string;
  parentId: string | null;
  sortOrder: string;
  beforeNodeId: string | null;
  afterNodeId: string | null;
}

const VALID_LEXO_RANK = /^[0-9a-z]+$/;

export function compareSortOrder(a: Pick<NodeSummaryDto, "sortOrder" | "title" | "id">, b: Pick<NodeSummaryDto, "sortOrder" | "title" | "id">): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder < b.sortOrder ? -1 : 1;
  }
  if (a.title !== b.title) {
    return a.title.localeCompare(b.title);
  }
  return a.id.localeCompare(b.id);
}

/**
 * Normalizes either a flat list of nodes or an already-nested tree into a clean,
 * cycle-free, sortOrder-sorted recursive `NodeTreeItemDto[]`.
 */
export function buildNodeTree(items: readonly NodeTreeInput[]): NodeTreeItemDto[] {
  const flatMap = new Map<string, NodeTreeItemDto>();

  const collect = (list: readonly NodeTreeInput[]) => {
    for (const item of list) {
      if (!flatMap.has(item.id)) {
        flatMap.set(item.id, {
          id: item.id,
          spaceId: item.spaceId,
          parentId: item.parentId ?? null,
          type: item.type,
          title: item.title,
          icon: item.icon,
          sortOrder: item.sortOrder,
          version: item.version,
          updatedAt: item.updatedAt,
          updatedBy: item.updatedBy,
          hasChildren: item.hasChildren,
          children: [],
        });
      }
      if (Array.isArray(item.children) && item.children.length > 0) {
        collect(item.children);
      }
    }
  };

  collect(items);

  const roots: NodeTreeItemDto[] = [];

  for (const node of flatMap.values()) {
    const parentId = node.parentId;
    if (parentId && parentId !== node.id && flatMap.has(parentId)) {
      // Guard against corrupt cyclic data from server
      let cursor: string | null = parentId;
      let createsCycle = false;
      const visited = new Set<string>([node.id]);
      while (cursor) {
        if (visited.has(cursor)) {
          createsCycle = true;
          break;
        }
        visited.add(cursor);
        cursor = flatMap.get(cursor)?.parentId ?? null;
      }

      if (createsCycle) {
        roots.push({ ...node, parentId: null });
      } else {
        flatMap.get(parentId)!.children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (list: NodeTreeItemDto[]) => {
    list.sort(compareSortOrder);
    for (const item of list) {
      if (item.children.length > 0) {
        sortRecursive(item.children);
      }
      item.hasChildren = item.children.length > 0;
    }
  };

  sortRecursive(roots);
  return roots;
}

export function indexTreeById(roots: readonly NodeTreeItemDto[]): Map<string, NodeTreeItemDto> {
  const map = new Map<string, NodeTreeItemDto>();
  const walk = (list: readonly NodeTreeItemDto[]) => {
    for (const item of list) {
      map.set(item.id, item);
      if (item.children.length > 0) {
        walk(item.children);
      }
    }
  };
  walk(roots);
  return map;
}

/**
 * Returns true if `candidateId` is equal to `ancestorId` or nested anywhere inside `ancestorId`.
 * Used as a client-side cycle guard for drag-and-drop reparenting.
 */
export function isDescendant(
  roots: readonly NodeTreeItemDto[],
  ancestorId: string,
  candidateId: string,
): boolean {
  if (ancestorId === candidateId) return true;
  const nodeMap = indexTreeById(roots);
  const ancestor = nodeMap.get(ancestorId);
  if (!ancestor) return false;

  const stack: NodeTreeItemDto[] = [...ancestor.children];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.id === candidateId) return true;
    for (const child of current.children) {
      stack.push(child);
    }
  }
  return false;
}

export function getDescendantIds(roots: readonly NodeTreeItemDto[], nodeId: string): Set<string> {
  const result = new Set<string>([nodeId]);
  const nodeMap = indexTreeById(roots);
  const root = nodeMap.get(nodeId);
  if (!root) return result;

  const stack: NodeTreeItemDto[] = [...root.children];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (result.has(current.id)) continue;
    result.add(current.id);
    for (const child of current.children) {
      stack.push(child);
    }
  }
  return result;
}

export function flattenVisibleTree(
  roots: readonly NodeTreeItemDto[],
  expandedIds: ReadonlySet<string>,
): FlattenedTreeRow[] {
  const rows: FlattenedTreeRow[] = [];

  const walk = (list: readonly NodeTreeItemDto[], depth: number, parentId: string | null) => {
    for (const node of list) {
      const hasChildren = node.children.length > 0;
      rows.push({ node, depth, parentId, hasChildren });
      if (hasChildren && expandedIds.has(node.id)) {
        walk(node.children, depth + 1, node.id);
      }
    }
  };

  walk(roots, 0, null);
  return rows;
}

export function collectVisibleNodeIds(
  roots: readonly NodeTreeItemDto[],
  expandedIds: ReadonlySet<string>,
): string[] {
  return flattenVisibleTree(roots, expandedIds).map((row) => row.node.id);
}

function normalizeRankOrNull(rank: string | null | undefined): string | null {
  if (!rank) return null;
  return VALID_LEXO_RANK.test(rank) ? rank : null;
}

export function computeSafeSortOrder(
  beforeRank?: string | null,
  afterRank?: string | null,
): string {
  const prev = normalizeRankOrNull(beforeRank);
  const next = normalizeRankOrNull(afterRank);

  if (prev && next) {
    if (prev < next) {
      return rankBetween(prev, next);
    }
    // Fallback if server ever had duplicate/out-of-order ranks
    return rankAfter(prev);
  }
  if (prev) {
    return rankAfter(prev);
  }
  if (next) {
    return rankBefore(next);
  }
  return rankAfter(null);
}

/**
 * Computes the destination `{ parentId, sortOrder, beforeNodeId, afterNodeId }` for a drag-and-drop
 * move while enforcing client-side cycle prevention. Returns `null` if the move is invalid or a no-op.
 */
export function computeMovePlan(
  roots: readonly NodeTreeItemDto[],
  draggedId: string,
  targetId: string,
  intent: DropIntent,
): MoveNodePlan | null {
  if (!draggedId || !targetId || draggedId === targetId) return null;

  const nodeMap = indexTreeById(roots);
  const draggedNode = nodeMap.get(draggedId);
  const targetNode = nodeMap.get(targetId);
  if (!draggedNode || !targetNode) return null;

  // Cycle prevention: never move a node into itself or any descendant
  if (isDescendant(roots, draggedId, targetId)) {
    return null;
  }

  if (intent === "inside") {
    const existingChildren = targetNode.children
      .filter((child) => child.id !== draggedId)
      .sort(compareSortOrder);
    const lastChild = existingChildren[existingChildren.length - 1] ?? null;
    const sortOrder = computeSafeSortOrder(lastChild?.sortOrder ?? null, null);
    return {
      nodeId: draggedId,
      parentId: targetNode.id,
      sortOrder,
      beforeNodeId: lastChild?.id ?? null,
      afterNodeId: null,
    };
  }

  const destinationParentId = targetNode.parentId ?? null;
  if (destinationParentId && isDescendant(roots, draggedId, destinationParentId)) {
    return null;
  }

  const rawSiblings = destinationParentId
    ? (nodeMap.get(destinationParentId)?.children ?? [])
    : roots;
  const siblings = rawSiblings
    .filter((sibling) => sibling.id !== draggedId)
    .sort(compareSortOrder);

  const targetIdx = siblings.findIndex((sibling) => sibling.id === targetId);
  if (targetIdx === -1) return null;

  const beforeNode =
    intent === "before" ? (siblings[targetIdx - 1] ?? null) : (siblings[targetIdx] ?? null);
  const afterNode =
    intent === "before" ? (siblings[targetIdx] ?? null) : (siblings[targetIdx + 1] ?? null);

  const sortOrder = computeSafeSortOrder(
    beforeNode?.sortOrder ?? null,
    afterNode?.sortOrder ?? null,
  );

  return {
    nodeId: draggedId,
    parentId: destinationParentId,
    sortOrder,
    beforeNodeId: beforeNode?.id ?? null,
    afterNodeId: afterNode?.id ?? null,
  };
}

export function getAncestorIds(
  roots: readonly NodeTreeItemDto[],
  targetId: string,
): string[] {
  const nodeMap = indexTreeById(roots);
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let cursor = nodeMap.get(targetId)?.parentId ?? null;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    ancestors.push(cursor);
    cursor = nodeMap.get(cursor)?.parentId ?? null;
  }
  return ancestors;
}
