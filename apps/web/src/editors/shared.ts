import type { MediaDto, NodeType } from "@merak/shared";
import { useEffect, useRef } from "react";

export interface NodeTypeMeta {
  label: string;
  shortLabel: string;
  defaultChildTitle: string;
}

export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
  doc: {
    label: "Markdown Document",
    shortLabel: "Doc",
    defaultChildTitle: "Untitled Page",
  },
  excalidraw: {
    label: "Excalidraw Whiteboard",
    shortLabel: "Excalidraw",
    defaultChildTitle: "Untitled Whiteboard",
  },
  html: {
    label: "HTML Artifact",
    shortLabel: "HTML",
    defaultChildTitle: "Untitled Artifact",
  },
  canvas: {
    label: "Infinite Canvas",
    shortLabel: "Canvas",
    defaultChildTitle: "Untitled Canvas",
  },
  folder: {
    label: "Folder",
    shortLabel: "Folder",
    defaultChildTitle: "Untitled Folder",
  },
};

export function isNodeType(value: unknown): value is NodeType {
  return (
    value === "doc" ||
    value === "excalidraw" ||
    value === "html" ||
    value === "canvas" ||
    value === "folder"
  );
}

export function formatMediaUrl(media: Pick<MediaDto, "id" | "url">): string {
  if (media.id) {
    return `/api/media/${media.id}`;
  }
  return media.url;
}

export function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s";
}

export function useGlobalSaveShortcut(
  enabled: boolean,
  onTrigger: () => void | Promise<void>,
): void {
  const callbackRef = useRef(onTrigger);
  callbackRef.current = onTrigger;

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      void callbackRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
