export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface BlockNodeLike {
  id: string;
  children?: readonly BlockNodeLike[];
}

export function normalizeMarqueeRect(start: Point, current: Point): Rect {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const right = Math.max(start.x, current.x);
  const bottom = Math.max(start.y, current.y);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Keep selected block IDs in document order and skip nested children
 * when an ancestor block is already selected.
 */
export function filterTopmostSelectedBlockIds(
  hitIds: ReadonlySet<string>,
  tree: readonly BlockNodeLike[],
): string[] {
  const ordered: string[] = [];

  const visit = (nodes: readonly BlockNodeLike[]) => {
    for (const node of nodes) {
      if (hitIds.has(node.id)) {
        ordered.push(node.id);
        continue;
      }
      if (node.children && node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(tree);
  return ordered;
}

function cloneJsonValue<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as unknown as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    cloned[key] = cloneJsonValue(entry);
  }
  return cloned as T;
}

export type BlockMenuShortcutAction =
  | "delete"
  | "duplicate"
  | "copy"
  | "move-up"
  | "move-down";

export interface BlockMenuShortcutInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  isEditable: boolean;
  isSearchInput: boolean;
  searchQuery: string;
  hasSearchSelection?: boolean;
}

export function resolveBlockMenuShortcut(
  input: BlockMenuShortcutInput,
): BlockMenuShortcutAction | null {
  if (input.isComposing) return null;

  const hasCmd = Boolean(input.metaKey || input.ctrlKey);

  if (
    input.isEditable &&
    (input.key === "Backspace" || input.key === "Delete") &&
    !hasCmd &&
    !input.altKey
  ) {
    if (input.isSearchInput && input.searchQuery.length > 0) {
      return null;
    }
    return "delete";
  }

  if (!hasCmd || input.altKey) return null;

  const lowerKey = input.key.toLowerCase();
  if (input.isEditable && lowerKey === "d" && !input.shiftKey) {
    return "duplicate";
  }
  if (lowerKey === "c" && !input.shiftKey) {
    if (input.isSearchInput && input.hasSearchSelection) {
      return null;
    }
    return "copy";
  }
  if (input.isEditable && input.shiftKey && input.key === "ArrowUp") {
    return "move-up";
  }
  if (input.isEditable && input.shiftKey && input.key === "ArrowDown") {
    return "move-down";
  }

  return null;
}

export function cloneBlocksForDuplicate<
  T extends { id?: string; type?: unknown; props?: unknown; content?: unknown; children?: unknown[] },
>(blocks: readonly T[]): Record<string, unknown>[] {
  return blocks.map((block) => {
    const copy: Record<string, unknown> = {
      type: block.type,
    };
    if (block.props !== undefined) {
      copy.props = cloneJsonValue(block.props);
    }
    if (block.content !== undefined) {
      copy.content = cloneJsonValue(block.content);
    }
    if (Array.isArray(block.children) && block.children.length > 0) {
      copy.children = cloneBlocksForDuplicate(block.children as T[]);
    }
    return copy;
  });
}
