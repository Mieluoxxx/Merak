import { describe, expect, it } from "vitest";
import {
  cloneBlocksForDuplicate,
  filterTopmostSelectedBlockIds,
  normalizeMarqueeRect,
  rectsIntersect,
  resolveBlockMenuShortcut,
} from "../blockSelection.js";

describe("blockSelection helpers", () => {
  it("normalizes marquee rectangles across all drag directions", () => {
    expect(normalizeMarqueeRect({ x: 100, y: 200 }, { x: 250, y: 320 })).toEqual({
      left: 100,
      top: 200,
      right: 250,
      bottom: 320,
      width: 150,
      height: 120,
    });

    expect(normalizeMarqueeRect({ x: 250, y: 320 }, { x: 100, y: 200 })).toEqual({
      left: 100,
      top: 200,
      right: 250,
      bottom: 320,
      width: 150,
      height: 120,
    });
  });

  it("detects AABB rectangle intersection accurately", () => {
    const marquee = { left: 100, top: 100, right: 300, bottom: 250, width: 200, height: 150 };
    expect(
      rectsIntersect(marquee, { left: 250, top: 200, right: 500, bottom: 260, width: 250, height: 60 }),
    ).toBe(true);
    expect(
      rectsIntersect(marquee, { left: 300, top: 200, right: 500, bottom: 260, width: 200, height: 60 }),
    ).toBe(false);
    expect(
      rectsIntersect(marquee, { left: 10, top: 10, right: 80, bottom: 80, width: 70, height: 70 }),
    ).toBe(false);
  });

  it("orders selected block IDs in document order and skips descendants of selected parents", () => {
    const tree = [
      { id: "b1", children: [{ id: "b1-a" }, { id: "b1-b" }] },
      { id: "b2", children: [{ id: "b2-a" }] },
      { id: "b3" },
    ];

    expect(
      filterTopmostSelectedBlockIds(new Set(["b3", "b1-a", "b1", "b2-a"]), tree),
    ).toEqual(["b1", "b2-a", "b3"]);
  });

  it("clones blocks without keeping IDs recursively for duplication", () => {
    const clones = cloneBlocksForDuplicate([
      {
        id: "b1",
        type: "paragraph",
        props: { textColor: "default" },
        content: [{ type: "text", text: "Hello", styles: {} }],
        children: [
          {
            id: "b1-child",
            type: "bulletListItem",
            props: {},
            content: [{ type: "text", text: "Nested", styles: {} }],
          },
        ],
      },
    ]);

    expect(clones).toEqual([
      {
        type: "paragraph",
        props: { textColor: "default" },
        content: [{ type: "text", text: "Hello", styles: {} }],
        children: [
          {
            type: "bulletListItem",
            props: {},
            content: [{ type: "text", text: "Nested", styles: {} }],
          },
        ],
      },
    ]);
  });

  it("resolves block menu keyboard shortcuts while protecting search typing and IME", () => {
    expect(
      resolveBlockMenuShortcut({
        key: "Backspace",
        isEditable: true,
        isSearchInput: true,
        searchQuery: "",
      }),
    ).toBe("delete");

    expect(
      resolveBlockMenuShortcut({
        key: "Delete",
        isEditable: true,
        isSearchInput: false,
        searchQuery: "div",
      }),
    ).toBe("delete");

    expect(
      resolveBlockMenuShortcut({
        key: "Backspace",
        isEditable: true,
        isSearchInput: true,
        searchQuery: "del",
      }),
    ).toBeNull();

    expect(
      resolveBlockMenuShortcut({
        key: "Backspace",
        isComposing: true,
        isEditable: true,
        isSearchInput: false,
        searchQuery: "",
      }),
    ).toBeNull();

    expect(
      resolveBlockMenuShortcut({
        key: "Backspace",
        isEditable: false,
        isSearchInput: false,
        searchQuery: "",
      }),
    ).toBeNull();

    expect(
      resolveBlockMenuShortcut({
        key: "d",
        metaKey: true,
        isEditable: true,
        isSearchInput: true,
        searchQuery: "",
      }),
    ).toBe("duplicate");

    expect(
      resolveBlockMenuShortcut({
        key: "c",
        metaKey: true,
        isEditable: false,
        isSearchInput: true,
        searchQuery: "abc",
        hasSearchSelection: false,
      }),
    ).toBe("copy");

    expect(
      resolveBlockMenuShortcut({
        key: "c",
        metaKey: true,
        isEditable: true,
        isSearchInput: true,
        searchQuery: "abc",
        hasSearchSelection: true,
      }),
    ).toBeNull();

    expect(
      resolveBlockMenuShortcut({
        key: "ArrowUp",
        metaKey: true,
        shiftKey: true,
        isEditable: true,
        isSearchInput: true,
        searchQuery: "",
      }),
    ).toBe("move-up");

    expect(
      resolveBlockMenuShortcut({
        key: "ArrowDown",
        ctrlKey: true,
        shiftKey: true,
        isEditable: true,
        isSearchInput: false,
        searchQuery: "",
      }),
    ).toBe("move-down");
  });
});
