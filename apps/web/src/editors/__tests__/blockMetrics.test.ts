import { describe, expect, it } from "vitest";
import {
  countWordsAndChars,
  extractBlockPlainText,
  extractBlocksPlainText,
  getBlockTypeLabel,
} from "../blockMetrics.js";

describe("blockMetrics", () => {
  it("formats human-readable block type labels including heading levels", () => {
    expect(getBlockTypeLabel({ type: "paragraph" })).toBe("Text");
    expect(getBlockTypeLabel({ type: "heading", props: { level: 2 } })).toBe("Heading 2");
    expect(getBlockTypeLabel({ type: "numberedListItem" })).toBe("Numbered list");
    expect(getBlockTypeLabel({ type: "checkListItem" })).toBe("To-do list");
    expect(getBlockTypeLabel({ type: "customWidget" })).toBe("CustomWidget");
  });

  it("extracts plain text from inline nodes, links, tables, and nested children", () => {
    const block = {
      content: [
        { type: "text", text: "Numbered " },
        { type: "link", content: [{ type: "text", text: "second" }] },
      ],
      children: [
        {
          content: [{ type: "text", text: "Nested item" }],
        },
      ],
    };
    expect(extractBlockPlainText(block)).toBe("Numbered second\nNested item");

    const tableBlock = {
      content: {
        type: "tableContent",
        rows: [
          {
            cells: [
              [{ type: "text", text: "Col A" }],
              { content: [{ type: "text", text: "Col B" }] },
            ],
          },
        ],
      },
    };
    expect(extractBlocksPlainText([tableBlock])).toBe("Col A Col B");
  });

  it("counts words and characters for English, CJK, and mixed text", () => {
    expect(countWordsAndChars("")).toEqual({ words: 0, chars: 0 });
    expect(countWordsAndChars("   \n ")).toEqual({ words: 0, chars: 0 });
    expect(countWordsAndChars("Numbered second")).toEqual({ words: 2, chars: 15 });
    expect(countWordsAndChars("Heading 3 三级标题")).toEqual({ words: 6, chars: 14 });
  });
});
