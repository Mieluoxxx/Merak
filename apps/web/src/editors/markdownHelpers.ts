import type { NodeType } from "@merak/shared";
import { isNodeType } from "./shared.js";

export const DEFAULT_EMBED_HEIGHT = 460;
export const MIN_EMBED_HEIGHT = 160;
export const MAX_EMBED_HEIGHT = 1200;

export interface MerakChildDirective {
  kind: "child";
  nodeId: string;
  nodeType: NodeType;
  title: string;
}

export interface MerakEmbedDirective {
  kind: "embed";
  nodeId: string;
  height: number;
}

export interface MerakEquationDirective {
  kind: "equation";
  latex: string;
}

export type MerakDirective = MerakChildDirective | MerakEmbedDirective;

export type MarkdownSegment =
  | { kind: "markdown"; markdown: string }
  | MerakChildDirective
  | MerakEmbedDirective
  | MerakEquationDirective;

function escapeAttrValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

function unescapeAttrValue(value: string): string {
  return value.replace(/\\(["\\])/g, "$1");
}

export function clampEmbedHeight(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_EMBED_HEIGHT;
  return Math.max(MIN_EMBED_HEIGHT, Math.min(MAX_EMBED_HEIGHT, Math.round(numeric)));
}

export function formatChildDirective(input: {
  nodeId: string;
  nodeType: NodeType;
  title: string;
}): string {
  const safeId = escapeAttrValue(input.nodeId);
  const safeType = isNodeType(input.nodeType) ? input.nodeType : "doc";
  const safeTitle = escapeAttrValue(input.title || "Untitled");
  return `::child{node="${safeId}" type="${safeType}" title="${safeTitle}"}`;
}

export function formatEmbedDirective(input: {
  nodeId: string;
  height?: number;
}): string {
  const safeId = escapeAttrValue(input.nodeId);
  const safeHeight = clampEmbedHeight(input.height ?? DEFAULT_EMBED_HEIGHT);
  return `::embed{node="${safeId}" height="${safeHeight}"}`;
}

function parseDirectiveAttributes(rawAttrs: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s}]+))/g;
  for (const match of rawAttrs.matchAll(attrRegex)) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key) {
      attrs[key] = unescapeAttrValue(value);
    }
  }
  return attrs;
}

const DIRECTIVE_LINE_REGEX = /^::(child|embed)\{([^}]*)\}$/;

export function parseMerakDirective(line: string): MerakDirective | null {
  const trimmed = line.trim();
  const match = DIRECTIVE_LINE_REGEX.exec(trimmed);
  if (!match) return null;

  const directiveName = match[1];
  const rawAttrs = match[2] ?? "";
  const attrs = parseDirectiveAttributes(rawAttrs);
  const nodeId = (attrs.node ?? attrs.nodeId ?? "").trim();
  if (!nodeId) return null;

  if (directiveName === "child") {
    const nodeType: NodeType = isNodeType(attrs.type) ? attrs.type : "doc";
    const title = (attrs.title ?? "Untitled").trim() || "Untitled";
    return {
      kind: "child",
      nodeId,
      nodeType,
      title,
    };
  }

  if (directiveName === "embed") {
    return {
      kind: "embed",
      nodeId,
      height: clampEmbedHeight(attrs.height),
    };
  }

  return null;
}

/**
 * Splits a Markdown document into standard Markdown chunks, Merak directive
 * blocks (`::child{...}` / `::embed{...}`), and display math blocks (`$$...$$`),
 * ignoring directives inside fenced code blocks.
 */
export function splitMarkdownWithDirectives(markdown: string): MarkdownSegment[] {
  if (!markdown) return [];

  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const segments: MarkdownSegment[] = [];
  let buffer: string[] = [];
  let activeFence: { marker: "`" | "~"; length: number } | null = null;
  let mathBuffer: string[] | null = null;

  const flushBuffer = () => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) {
      segments.push({ kind: "markdown", markdown: text });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (mathBuffer !== null) {
      if (line.trim() === "$$") {
        segments.push({
          kind: "equation",
          latex: mathBuffer.join("\n").trim(),
        });
        mathBuffer = null;
      } else {
        mathBuffer.push(line);
      }
      continue;
    }

    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch && fenceMatch[1]) {
      const seq = fenceMatch[1];
      const marker = seq[0] as "`" | "~";
      if (!activeFence) {
        activeFence = { marker, length: seq.length };
      } else if (activeFence.marker === marker && seq.length >= activeFence.length) {
        activeFence = null;
      }
      buffer.push(line);
      continue;
    }

    if (!activeFence) {
      const trimmed = line.trim();
      if (trimmed === "$$") {
        flushBuffer();
        mathBuffer = [];
        continue;
      }

      const singleLineMath = /^\$\$(.+)\$\$$/.exec(trimmed);
      if (singleLineMath && singleLineMath[1] !== undefined && !singleLineMath[1].includes("$$")) {
        flushBuffer();
        segments.push({
          kind: "equation",
          latex: singleLineMath[1].trim(),
        });
        continue;
      }

      const directive = parseMerakDirective(line);
      if (directive) {
        flushBuffer();
        segments.push(directive);
        continue;
      }
    }

    buffer.push(line);
  }

  if (mathBuffer !== null) {
    buffer.push("$$", ...mathBuffer);
  }

  flushBuffer();
  return segments;
}

export function joinMarkdownSegments(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export function extractDocExcerpt(markdown: string, maxLength = 240): string {
  const cleaned = markdown
    .split(/\r?\n/)
    .filter((line) => !parseMerakDirective(line) && line.trim() !== "$$")
    .map((line) => line.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)/, ""))
    .join(" ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Empty document";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
