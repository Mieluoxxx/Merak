export interface BlockColorOption {
  id: string;
  label: string;
  textSwatch: string;
  bgSwatch: string;
}

export const BLOCK_TEXT_COLORS: readonly BlockColorOption[] = [
  { id: "default", label: "Default", textSwatch: "var(--ui-ink)", bgSwatch: "transparent" },
  { id: "gray", label: "Gray", textSwatch: "#9b9a97", bgSwatch: "rgba(155, 154, 151, 0.28)" },
  { id: "brown", label: "Brown", textSwatch: "#ba856f", bgSwatch: "rgba(147, 114, 100, 0.36)" },
  { id: "orange", label: "Orange", textSwatch: "#d9822b", bgSwatch: "rgba(217, 115, 13, 0.32)" },
  { id: "yellow", label: "Yellow", textSwatch: "#dfab01", bgSwatch: "rgba(203, 145, 47, 0.36)" },
  { id: "green", label: "Green", textSwatch: "#4dab9a", bgSwatch: "rgba(68, 131, 97, 0.34)" },
  { id: "blue", label: "Blue", textSwatch: "#529cca", bgSwatch: "rgba(51, 126, 169, 0.34)" },
  { id: "purple", label: "Purple", textSwatch: "#9a6dd7", bgSwatch: "rgba(144, 101, 176, 0.34)" },
  { id: "pink", label: "Pink", textSwatch: "#e255a1", bgSwatch: "rgba(193, 76, 138, 0.34)" },
  { id: "red", label: "Red", textSwatch: "#ff7369", bgSwatch: "rgba(212, 76, 71, 0.34)" },
];

export const BLOCK_BG_COLORS: readonly BlockColorOption[] = BLOCK_TEXT_COLORS;

const BLOCK_TYPE_LABELS: Record<string, string> = {
  paragraph: "Text",
  bulletListItem: "Bulleted list",
  numberedListItem: "Numbered list",
  checkListItem: "To-do list",
  quote: "Quote",
  codeBlock: "Code",
  merakBlockEquation: "Equation",
  divider: "Divider",
  toggleListItem: "Toggle list",
  table: "Table",
  image: "Image",
  video: "Video",
  audio: "Audio",
  file: "File",
};

export function getBlockTypeLabel(block: {
  type: string;
  props?: Record<string, unknown>;
}): string {
  if (block.type === "heading") {
    const level = typeof block.props?.level === "number" ? block.props.level : 1;
    return `Heading ${level}`;
  }
  const known = BLOCK_TYPE_LABELS[block.type];
  if (known) return known;
  return block.type.charAt(0).toUpperCase() + block.type.slice(1);
}

function extractInlineText(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  let out = "";
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const item = node as Record<string, unknown>;
    if (item.type === "merakEquation") {
      const props = (item.props ?? {}) as Record<string, unknown>;
      if (typeof props.latex === "string" && props.latex.length > 0) {
        out += props.latex;
      }
    } else if (typeof item.text === "string") {
      out += item.text;
    } else if (Array.isArray(item.content)) {
      out += extractInlineText(item.content);
    }
  }
  return out;
}

function extractTableText(content: Record<string, unknown>): string {
  if (!Array.isArray(content.rows)) return "";
  const rowTexts: string[] = [];
  for (const row of content.rows) {
    if (!row || typeof row !== "object") continue;
    const cells = (row as Record<string, unknown>).cells;
    if (!Array.isArray(cells)) continue;
    const cellTexts = cells
      .map((cell) => {
        if (Array.isArray(cell)) return extractInlineText(cell);
        if (cell && typeof cell === "object" && Array.isArray((cell as Record<string, unknown>).content)) {
          return extractInlineText((cell as Record<string, unknown>).content);
        }
        return "";
      })
      .filter(Boolean);
    if (cellTexts.length > 0) rowTexts.push(cellTexts.join(" "));
  }
  return rowTexts.join("\n");
}

export interface BlockTextLike {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: readonly BlockTextLike[];
}

export function extractBlockPlainText(block: BlockTextLike): string {
  const parts: string[] = [];

  if (block.type === "merakBlockEquation") {
    const latex = typeof block.props?.latex === "string" ? block.props.latex.trim() : "";
    if (latex) parts.push(latex);
  } else if (Array.isArray(block.content)) {
    const inline = extractInlineText(block.content);
    if (inline) parts.push(inline);
  } else if (block.content && typeof block.content === "object") {
    const contentObj = block.content as Record<string, unknown>;
    if (contentObj.type === "tableContent") {
      const tableText = extractTableText(contentObj);
      if (tableText) parts.push(tableText);
    }
  }

  if (Array.isArray(block.children) && block.children.length > 0) {
    for (const child of block.children) {
      const childText = extractBlockPlainText(child);
      if (childText) parts.push(childText);
    }
  }

  return parts.join("\n");
}

export function extractBlocksPlainText(blocks: readonly BlockTextLike[]): string {
  return blocks
    .map((block) => extractBlockPlainText(block))
    .filter((text) => text.length > 0)
    .join("\n");
}

const WORD_OR_CJK_REGEX =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z0-9_]+(?:['’-][A-Za-z0-9_]+)*/gu;

export function countWordsAndChars(text: string): { words: number; chars: number } {
  const normalized = text.replace(/\r?\n/g, "");
  if (normalized.trim().length === 0) {
    return { words: 0, chars: 0 };
  }
  const matches = normalized.match(WORD_OR_CJK_REGEX);
  return {
    words: matches ? matches.length : 0,
    chars: normalized.length,
  };
}
