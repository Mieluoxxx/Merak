import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  filterTopmostSelectedBlockIds,
  normalizeMarqueeRect,
  rectsIntersect,
  type BlockNodeLike,
  type Rect,
} from "./blockSelection.js";

export interface UseBlockMarqueeSelectionOptions {
  containerRef: RefObject<HTMLElement | null>;
  getDocumentBlocks: () => readonly BlockNodeLike[];
  readOnly: boolean;
  nodeId: string;
  highlightedBlockId?: string | null;
  onCopySelected: (ids: string[]) => void | Promise<void>;
  onDuplicateSelected: (ids: string[]) => void;
  onDeleteSelected: (ids: string[]) => void;
}

export interface BatchAnchorRect {
  top: number;
  left: number;
}

const DRAG_THRESHOLD_PX = 4;

const INTERACTIVE_START_SELECTOR = [
  ".bn-inline-content",
  ".bn-side-menu",
  ".bn-ak-menu",
  '[data-slot="menu-content"]',
  '[data-slot="merak-batch-bar"]',
  "button",
  "a",
  "input",
  "textarea",
  "select",
  '[data-node-type="merakChild"]',
  '[data-node-type="merakEmbed"]',
  '[data-node-type="merakBlockEquation"]',
  ".merak-inline-equation",
  '[data-merak-equation-popover="true"]',
  '[data-merak-image-block="true"]',
  '[data-merak-comments="true"]',
].join(", ");

const UI_OVERLAY_SELECTOR = [
  '[data-slot="merak-batch-bar"]',
  '[data-slot="menu-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="dialog-content"]',
  '[data-merak-equation-popover="true"]',
  '[data-merak-comments="true"]',
  ".merak-image-lightbox",
  ".bn-ak-menu",
].join(", ");

export function useBlockMarqueeSelection({
  containerRef,
  getDocumentBlocks,
  readOnly,
  nodeId,
  highlightedBlockId = null,
  onCopySelected,
  onDuplicateSelected,
  onDeleteSelected,
}: UseBlockMarqueeSelectionOptions) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [anchorRect, setAnchorRect] = useState<BatchAnchorRect | null>(null);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  const callbacksRef = useRef({
    getDocumentBlocks,
    onCopySelected,
    onDuplicateSelected,
    onDeleteSelected,
  });
  callbacksRef.current = {
    getDocumentBlocks,
    onCopySelected,
    onDuplicateSelected,
    onDeleteSelected,
  };

  const dragCleanupRef = useRef<(() => void) | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setAnchorRect(null);
  }, []);

  const computeAnchorForIds = useCallback(
    (ids: readonly string[]): BatchAnchorRect | null => {
      const container = containerRef.current;
      const firstId = ids[0];
      if (!container || !firstId) return null;
      const firstEl = container.querySelector<HTMLElement>(
        `[data-node-type="blockContainer"][data-id="${CSS.escape(firstId)}"]`,
      );
      if (!firstEl) return null;
      const rect = firstEl.getBoundingClientRect();
      return {
        top: Math.max(52, rect.top - 44),
        left: Math.max(16, rect.left),
      };
    },
    [containerRef],
  );

  // Sync data-merak-selected attribute on BlockNote blockContainer DOM nodes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const selectedSet = new Set(selectedIds);
    const blockEls = container.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]');
    for (const el of blockEls) {
      const id = el.getAttribute("data-id");
      if (id && (selectedSet.has(id) || id === highlightedBlockId)) {
        el.setAttribute("data-merak-selected", "true");
      } else {
        el.removeAttribute("data-merak-selected");
      }
    }

    setAnchorRect(computeAnchorForIds(selectedIds));
  }, [computeAnchorForIds, containerRef, highlightedBlockId, selectedIds]);

  // Clear stale attributes on unmount.
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      const container = containerRef.current;
      if (!container) return;
      for (const el of container.querySelectorAll<HTMLElement>('[data-merak-selected="true"]')) {
        el.removeAttribute("data-merak-selected");
      }
    };
  }, [containerRef]);

  // Clear selection when switching nodes.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, nodeId]);

  // Keep floating bar aligned while scrolling/resizing.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const container = containerRef.current;
    const updateAnchor = () => {
      setAnchorRect(computeAnchorForIds(selectedIdsRef.current));
    };
    container?.addEventListener("scroll", updateAnchor, { passive: true });
    window.addEventListener("resize", updateAnchor, { passive: true });
    return () => {
      container?.removeEventListener("scroll", updateAnchor);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [computeAnchorForIds, containerRef, selectedIds.length]);

  // Clicking outside the batch bar / menu clears block selection.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const handleDocPointerDown = (event: PointerEvent) => {
      if (isDraggingRef.current) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(UI_OVERLAY_SELECTOR)) return;
      if (containerRef.current?.contains(target) && !target.closest(".bn-inline-content")) {
        // Clicking the empty gutter may start a new drag or clear on pointerup.
        return;
      }
      clearSelection();
    };
    document.addEventListener("pointerdown", handleDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", handleDocPointerDown, true);
  }, [clearSelection, containerRef, selectedIds.length]);

  // Global keyboard shortcuts while blocks are marquee-selected.
  useEffect(() => {
    if (selectedIds.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.closest('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]'))
      ) {
        return;
      }

      const ids = selectedIdsRef.current;
      if (ids.length === 0) return;

      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (!readOnly && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        callbacksRef.current.onDeleteSelected(ids);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && !readOnly) {
        event.preventDefault();
        callbacksRef.current.onDuplicateSelected(ids);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void callbacksRef.current.onCopySelected(ids);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, readOnly, selectedIds.length]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(INTERACTIVE_START_SELECTOR)) return;

      const container = containerRef.current;
      if (!container) return;

      dragCleanupRef.current?.();

      const start = { x: event.clientX, y: event.clientY };
      let crossedThreshold = false;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;

        if (!crossedThreshold) {
          if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
          crossedThreshold = true;
          setIsDragging(true);
          window.getSelection()?.removeAllRanges();
          const active = document.activeElement;
          if (active instanceof HTMLElement && container.contains(active)) {
            active.blur();
          }
        }

        const rect = normalizeMarqueeRect(start, {
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });
        setMarqueeRect(rect);

        const hitIds = new Set<string>();
        const blockEls = container.querySelectorAll<HTMLElement>(
          '[data-node-type="blockContainer"][data-id]',
        );
        for (const el of blockEls) {
          const id = el.getAttribute("data-id");
          if (!id) continue;
          const b = el.getBoundingClientRect();
          if (rectsIntersect(rect, b)) {
            hitIds.add(id);
          }
        }

        const ordered = filterTopmostSelectedBlockIds(
          hitIds,
          callbacksRef.current.getDocumentBlocks(),
        );
        setSelectedIds(ordered);
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        dragCleanupRef.current = null;
      };

      const handleUp = () => {
        cleanup();
        setMarqueeRect(null);
        setIsDragging(false);
        if (!crossedThreshold) {
          clearSelection();
        }
      };

      dragCleanupRef.current = cleanup;
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [clearSelection, containerRef],
  );

  return {
    selectedIds,
    setSelectedIds,
    clearSelection,
    marqueeRect,
    isDragging,
    anchorRect,
    handlePointerDown,
  };
}
