import { describe, expect, it } from "vitest";
import {
  extractCanvasText,
  extractExcalidrawText,
  extractMediaIdsFromContent,
  jsonCanvasDocumentSchema,
  normalizeExcalidrawDocument,
  rankAfter,
  rankBefore,
  rankBetween,
} from "../index.js";

describe("lexorank", () => {
  it("generates monotonic keys between bounds", () => {
    const first = rankAfter(null);
    const second = rankAfter(first);
    const middle = rankBetween(first, second);
    const beforeFirst = rankBefore(first);

    expect(beforeFirst < first).toBe(true);
    expect(first < middle).toBe(true);
    expect(middle < second).toBe(true);
  });

  it("handles tight adjacent prefixes without losing order", () => {
    let prev = "i";
    const next = "j";
    for (let i = 0; i < 15; i++) {
      const mid = rankBetween(prev, next);
      expect(prev < mid).toBe(true);
      expect(mid < next).toBe(true);
      prev = mid;
    }
  });
});

describe("excalidraw normalization & text extraction", () => {
  it("fills required element defaults and drops invalid bindings", () => {
    const doc = normalizeExcalidrawDocument({
      elements: [
        { id: "box-1", type: "rectangle", x: 10, y: 20 },
        { id: "txt-1", type: "text", x: 30, y: 40, text: "Auth Gateway" },
        {
          id: "arr-1",
          type: "arrow",
          x: 190,
          y: 60,
          startBinding: { elementId: "box-1" },
          endBinding: { elementId: "missing-id" },
        },
      ],
    });

    expect(doc.type).toBe("excalidraw");
    expect(doc.version).toBe(2);
    expect(doc.elements).toHaveLength(3);
    expect(doc.elements[0]?.seed).toBeTypeOf("number");
    expect(doc.elements[2]?.startBinding).toMatchObject({ elementId: "box-1" });
    expect(doc.elements[2]?.endBinding).toBeNull();
    expect(extractExcalidrawText(JSON.stringify(doc))).toBe("Auth Gateway");
  });
});

describe("json canvas schema & text extraction", () => {
  it("validates JSON Canvas 1.0 with Merak nodeId/mediaId extensions", () => {
    const canvas = {
      nodes: [
        {
          id: "n1",
          type: "file",
          file: "architecture.md",
          nodeId: "node_123",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
        },
        {
          id: "n2",
          type: "text",
          text: "Review auth flow",
          x: 400,
          y: 0,
          width: 240,
          height: 120,
        },
      ],
      edges: [
        {
          id: "e1",
          fromNode: "n1",
          toNode: "n2",
          label: "links to",
        },
      ],
    };

    const parsed = jsonCanvasDocumentSchema.parse(canvas);
    expect(parsed.nodes).toHaveLength(2);
    expect(extractCanvasText(JSON.stringify(parsed))).toContain("Review auth flow");
    expect(extractCanvasText(JSON.stringify(parsed))).toContain("links to");
  });
});

describe("media ref extraction", () => {
  it("extracts unique media IDs across markdown, html, and json content", () => {
    const md = "![diagram](/api/media/med_abc123) and ![again](/api/media/med_abc123)";
    const html = '<img src="/api/media/med_xyz-99" />';
    expect(extractMediaIdsFromContent(`${md}\n${html}`)).toEqual([
      "med_abc123",
      "med_xyz-99",
    ]);
  });
});
