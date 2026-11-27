import katex from "katex";

export type KatexRenderResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

export interface LatexHighlightToken {
  text: string;
  kind: "command" | "brace" | "plain";
}

export interface InlineMathMatch {
  start: number;
  end: number;
  latex: string;
}

const INLINE_PLACEHOLDER_PREFIX = "MERAKINLINEEQ";
const INLINE_PLACEHOLDER_SUFFIX = "END";
const INLINE_PLACEHOLDER_REGEX = /MERAKINLINEEQ(\d+)END/g;

export function makeInlineEquationPlaceholder(index: number): string {
  return `${INLINE_PLACEHOLDER_PREFIX}${index}${INLINE_PLACEHOLDER_SUFFIX}`;
}

export function renderKatexHtml(latex: string, displayMode: boolean): KatexRenderResult {
  if (latex.trim().length === 0) {
    return { ok: true, html: "" };
  }

  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: true,
      strict: false,
      trust: false,
    });
    return { ok: true, html };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const cleaned = raw.replace(/^KaTeX parse error:\s*/i, "").trim();
    return { ok: false, error: cleaned || "Invalid LaTeX syntax" };
  }
}

export function tokenizeLatexForHighlight(input: string): LatexHighlightToken[] {
  if (!input) return [];

  const tokens: LatexHighlightToken[] = [];
  const tokenRegex = /\\[a-zA-Z]+|\\[^a-zA-Z\s]|[{}[\]]/g;
  let lastIndex = 0;

  for (const match of input.matchAll(tokenRegex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({ text: input.slice(lastIndex, idx), kind: "plain" });
    }
    const value = match[0];
    tokens.push({
      text: value,
      kind: value.startsWith("\\") ? "command" : "brace",
    });
    lastIndex = idx + value.length;
  }

  if (lastIndex < input.length) {
    tokens.push({ text: input.slice(lastIndex), kind: "plain" });
  }

  return tokens;
}

export function formatBlockEquationMarkdown(latex: string): string {
  const trimmed = latex.trim();
  if (!trimmed) return "";
  return `$$\n${trimmed}\n$$`;
}

function isEscaped(line: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && line[i] === "\\"; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findInlineCodeSpans(line: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`" || isEscaped(line, i)) {
      i += 1;
      continue;
    }
    let tickCount = 1;
    while (i + tickCount < line.length && line[i + tickCount] === "`") {
      tickCount += 1;
    }
    const openerEnd = i + tickCount;
    let j = openerEnd;
    let closedAt = -1;
    while (j < line.length) {
      if (line[j] === "`") {
        let closeCount = 1;
        while (j + closeCount < line.length && line[j + closeCount] === "`") {
          closeCount += 1;
        }
        if (closeCount === tickCount) {
          closedAt = j + closeCount;
          break;
        }
        j += closeCount;
      } else {
        j += 1;
      }
    }
    if (closedAt !== -1) {
      spans.push([i, closedAt]);
      i = closedAt;
    } else {
      i = openerEnd;
    }
  }
  return spans;
}

function isInsideSpans(pos: number, spans: readonly [number, number][]): boolean {
  return spans.some(([start, end]) => pos >= start && pos < end);
}

/**
 * Finds the first completed inline math expression (`$$...$$` or `$...$`) on a single line,
 * skipping optional inline code spans and avoiding currency literals such as `$10 and $20`.
 */
export function findInlineMathMatchInLine(
  line: string,
  startFrom = 0,
  codeSpans: readonly [number, number][] = [],
): InlineMathMatch | null {
  let i = startFrom;
  while (i < line.length) {
    if (isInsideSpans(i, codeSpans)) {
      i += 1;
      continue;
    }
    if (line[i] !== "$" || isEscaped(line, i)) {
      i += 1;
      continue;
    }

    const isDouble = line[i + 1] === "$";
    if (isDouble) {
      const contentStart = i + 2;
      if (contentStart >= line.length) {
        i += 2;
        continue;
      }
      // Search for closing `$$` on the same line.
      let j = contentStart;
      while (j < line.length - 1) {
        if (isInsideSpans(j, codeSpans)) {
          j += 1;
          continue;
        }
        if (line[j] === "$" && line[j + 1] === "$" && !isEscaped(line, j)) {
          const inner = line.slice(contentStart, j);
          if (inner.trim().length > 0) {
            return { start: i, end: j + 2, latex: inner.trim() };
          }
          break;
        }
        j += 1;
      }
      i += 2;
      continue;
    }

    // Single `$` delimiter: opening `$` cannot be followed by whitespace.
    const nextChar = line[i + 1];
    if (!nextChar || /\s/.test(nextChar)) {
      i += 1;
      continue;
    }

    let j = i + 1;
    let found = false;
    while (j < line.length) {
      if (isInsideSpans(j, codeSpans)) {
        j += 1;
        continue;
      }
      if (line[j] === "$" && line[j + 1] !== "$" && !isEscaped(line, j)) {
        const prevChar = line[j - 1];
        const afterChar = line[j + 1];
        const validCloser =
          prevChar !== undefined &&
          !/\s/.test(prevChar) &&
          !(afterChar !== undefined && /[0-9]/.test(afterChar));
        if (validCloser) {
          const inner = line.slice(i + 1, j);
          if (inner.trim().length > 0) {
            return { start: i, end: j + 1, latex: inner.trim() };
          }
          found = true;
          break;
        }
      }
      j += 1;
    }

    if (!found) {
      i += 1;
    } else {
      i = j + 1;
    }
  }
  return null;
}

export function findInlineMathMatchInText(text: string): InlineMathMatch | null {
  if (!text || text.trim() === "$$") return null;
  if (text.includes("\n")) return null;
  return findInlineMathMatchInLine(text, 0, findInlineCodeSpans(text));
}

export function extractInlineMathPlaceholders(markdown: string): {
  markdown: string;
  equations: Map<string, string>;
} {
  const equations = new Map<string, string>();
  if (!markdown) {
    return { markdown, equations };
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let activeFence: { marker: "`" | "~"; length: number } | null = null;
  let counter = 0;

  const processed = lines.map((line) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch && fenceMatch[1]) {
      const seq = fenceMatch[1];
      const marker = seq[0] as "`" | "~";
      if (!activeFence) {
        activeFence = { marker, length: seq.length };
      } else if (activeFence.marker === marker && seq.length >= activeFence.length) {
        activeFence = null;
      }
      return line;
    }
    if (activeFence) {
      return line;
    }

    let current = line;
    let searchFrom = 0;
    while (searchFrom < current.length) {
      const codeSpans = findInlineCodeSpans(current);
      const match = findInlineMathMatchInLine(current, searchFrom, codeSpans);
      if (!match) break;

      const token = makeInlineEquationPlaceholder(counter);
      counter += 1;
      equations.set(token, match.latex);
      current = current.slice(0, match.start) + token + current.slice(match.end);
      searchFrom = match.start + token.length;
    }
    return current;
  });

  return {
    markdown: processed.join("\n"),
    equations,
  };
}

export function restoreInlineMathInMarkdown(
  markdown: string,
  equations: ReadonlyMap<string, string>,
): string {
  if (!markdown || equations.size === 0) return markdown;
  return markdown.replace(INLINE_PLACEHOLDER_REGEX, (token) => {
    const latex = equations.get(token);
    if (latex === undefined) return token;
    return `$${latex}$`;
  });
}

function cloneAndReplaceInlineNodes(
  nodes: readonly unknown[],
  equations: Map<string, string>,
  counterRef: { value: number },
): unknown[] {
  const out: unknown[] = [];
  for (const rawNode of nodes) {
    if (!rawNode || typeof rawNode !== "object") {
      out.push(rawNode);
      continue;
    }
    const item = rawNode as Record<string, unknown>;
    if (item.type === "merakEquation") {
      const props = (item.props ?? {}) as Record<string, unknown>;
      const latex = typeof props.latex === "string" ? props.latex.trim() : "";
      if (latex.length > 0) {
        const token = makeInlineEquationPlaceholder(counterRef.value);
        counterRef.value += 1;
        equations.set(token, latex);
        out.push({ type: "text", text: token, styles: {} });
      }
      continue;
    }

    if (item.type === "link" && Array.isArray(item.content)) {
      out.push({
        ...item,
        content: cloneAndReplaceInlineNodes(item.content, equations, counterRef),
      });
      continue;
    }

    out.push(item);
  }
  return out;
}

function cloneBlockReplacingInlineEquations(
  block: unknown,
  equations: Map<string, string>,
  counterRef: { value: number },
): unknown {
  if (!block || typeof block !== "object") return block;
  const obj = block as Record<string, unknown>;
  const next: Record<string, unknown> = { ...obj };

  if (Array.isArray(obj.content)) {
    next.content = cloneAndReplaceInlineNodes(obj.content, equations, counterRef);
  } else if (obj.content && typeof obj.content === "object") {
    const contentObj = obj.content as Record<string, unknown>;
    if (contentObj.type === "tableContent" && Array.isArray(contentObj.rows)) {
      next.content = {
        ...contentObj,
        rows: contentObj.rows.map((row) => {
          if (!row || typeof row !== "object") return row;
          const rowObj = row as Record<string, unknown>;
          if (!Array.isArray(rowObj.cells)) return row;
          return {
            ...rowObj,
            cells: rowObj.cells.map((cell) => {
              if (Array.isArray(cell)) {
                return cloneAndReplaceInlineNodes(cell, equations, counterRef);
              }
              if (cell && typeof cell === "object") {
                const cellObj = cell as Record<string, unknown>;
                if (Array.isArray(cellObj.content)) {
                  return {
                    ...cellObj,
                    content: cloneAndReplaceInlineNodes(cellObj.content, equations, counterRef),
                  };
                }
              }
              return cell;
            }),
          };
        }),
      };
    }
  }

  if (Array.isArray(obj.children)) {
    next.children = obj.children.map((child) =>
      cloneBlockReplacingInlineEquations(child, equations, counterRef),
    );
  }

  return next;
}

export function replaceInlineEquationsWithPlaceholders<T>(blocks: readonly T[]): {
  blocks: T[];
  equations: Map<string, string>;
} {
  const equations = new Map<string, string>();
  const counterRef = { value: 0 };
  const cloned = blocks.map((block) =>
    cloneBlockReplacingInlineEquations(block, equations, counterRef) as T,
  );
  return { blocks: cloned, equations };
}

function splitInlineNodesWithEquations(
  nodes: readonly unknown[],
  equations: ReadonlyMap<string, string>,
): unknown[] {
  const out: unknown[] = [];

  for (const rawNode of nodes) {
    if (typeof rawNode === "string") {
      out.push(...splitTextStringWithEquations(rawNode, {}, equations));
      continue;
    }
    if (!rawNode || typeof rawNode !== "object") {
      out.push(rawNode);
      continue;
    }
    const item = rawNode as Record<string, unknown>;
    if (item.type === "text" && typeof item.text === "string") {
      const styles =
        item.styles && typeof item.styles === "object"
          ? (item.styles as Record<string, unknown>)
          : {};
      out.push(...splitTextStringWithEquations(item.text, styles, equations));
      continue;
    }
    if (item.type === "link" && Array.isArray(item.content)) {
      out.push({
        ...item,
        content: splitInlineNodesWithEquations(item.content, equations),
      });
      continue;
    }
    out.push(item);
  }

  return out;
}

function splitTextStringWithEquations(
  text: string,
  styles: Record<string, unknown>,
  equations: ReadonlyMap<string, string>,
): unknown[] {
  const out: unknown[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_PLACEHOLDER_REGEX)) {
    const token = match[0];
    const idx = match.index ?? 0;
    const latex = equations.get(token);
    if (latex === undefined) continue;

    if (idx > lastIndex) {
      out.push({ type: "text", text: text.slice(lastIndex, idx), styles });
    }
    out.push({
      type: "merakEquation",
      props: { latex },
    });
    lastIndex = idx + token.length;
  }

  if (lastIndex === 0) {
    return [{ type: "text", text, styles }];
  }

  if (lastIndex < text.length) {
    out.push({ type: "text", text: text.slice(lastIndex), styles });
  }
  return out;
}

function hydrateBlockInlineEquations(
  block: unknown,
  equations: ReadonlyMap<string, string>,
): unknown {
  if (!block || typeof block !== "object") return block;
  const obj = block as Record<string, unknown>;
  const next: Record<string, unknown> = { ...obj };

  if (Array.isArray(obj.content)) {
    next.content = splitInlineNodesWithEquations(obj.content, equations);
  } else if (obj.content && typeof obj.content === "object") {
    const contentObj = obj.content as Record<string, unknown>;
    if (contentObj.type === "tableContent" && Array.isArray(contentObj.rows)) {
      next.content = {
        ...contentObj,
        rows: contentObj.rows.map((row) => {
          if (!row || typeof row !== "object") return row;
          const rowObj = row as Record<string, unknown>;
          if (!Array.isArray(rowObj.cells)) return row;
          return {
            ...rowObj,
            cells: rowObj.cells.map((cell) => {
              if (Array.isArray(cell)) {
                return splitInlineNodesWithEquations(cell, equations);
              }
              if (cell && typeof cell === "object") {
                const cellObj = cell as Record<string, unknown>;
                if (Array.isArray(cellObj.content)) {
                  return {
                    ...cellObj,
                    content: splitInlineNodesWithEquations(cellObj.content, equations),
                  };
                }
              }
              return cell;
            }),
          };
        }),
      };
    }
  }

  if (Array.isArray(obj.children)) {
    next.children = obj.children.map((child) => hydrateBlockInlineEquations(child, equations));
  }

  return next;
}

export function hydrateInlineEquationPlaceholders<T>(
  blocks: readonly T[],
  equations: ReadonlyMap<string, string>,
): T[] {
  if (equations.size === 0) return [...blocks];
  return blocks.map((block) => hydrateBlockInlineEquations(block, equations) as T);
}
