import { describe, expect, it } from "vitest";
import type { MerakFlowEdge, MerakFlowNode } from "../canvasHelpers.js";
import {
  CANVAS_HISTORY_LIMIT,
  computeNodesBounds,
  createCanvasHistory,
  createGroupForNodes,
  duplicateCanvasSelection,
  pushCanvasHistory,
  redoCanvasHistory,
  resolveCanvasNodeColor,
  undoCanvasHistory,
  ungroupNode,
} from "../canvasOps.js";

function makeTextNode(id: string, x: number, y: number, w = 280, h = 160): MerakFlowNode {
  return {
    id,
    type: "canvasText",
    position: { x, y },
    width: w,
    height: h,
    style: { width: w, height: h },
    data: { canvasType: "text", text: `Note ${id}` },
  };
}

describe("canvasOps", () => {
  it("resolves named colors, JSON Canvas preset indices, and hex codes", () => {
    expect(resolveCanvasNodeColor()).toBeNull();
    expect(resolveCanvasNodeColor("default")).toBeNull();
    expect(resolveCanvasNodeColor("blue")?.border).toBe("#3b76c2");
    expect(resolveCanvasNodeColor("5")?.border).toBe("#3b76c2");
    expect(resolveCanvasNodeColor("#ff5500")).toEqual({
      border: "#ff5500",
      tint: "#ff55001f",
      dot: "#ff5500",
    });
  });

  it("computes bounding box and wraps selected nodes in a group + ungroups cleanly", () => {
    const n1 = makeTextNode("n1", 100, 120, 280, 160);
    const n2 = makeTextNode("n2", 440, 200, 240, 140);
    const bounds = computeNodesBounds([n1, n2]);
    expect(bounds).toEqual({
      left: 100,
      top: 120,
      right: 680,
      bottom: 340,
      width: 580,
      height: 220,
    });

    const grouped = createGroupForNodes([n1, n2], ["n1", "n2"], "grp-1");
    expect(grouped).toHaveLength(3);
    expect(grouped[0]?.id).toBe("grp-1");
    expect(grouped[0]?.type).toBe("canvasGroup");
    expect(grouped[0]?.position).toEqual({ x: 64, y: 72 });
    expect(grouped[0]?.width).toBe(652);
    expect(grouped[0]?.height).toBe(304);
    expect(grouped[0]?.selected).toBe(true);
    expect(grouped[1]?.selected).toBe(false);

    const ungrouped = ungroupNode(grouped, "grp-1");
    expect(ungrouped.map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("duplicates selected nodes with internal edges and selects only clones", () => {
    const n1 = { ...makeTextNode("n1", 0, 0), selected: true };
    const n2 = { ...makeTextNode("n2", 300, 50), selected: true };
    const n3 = makeTextNode("n3", 700, 0);
    const edges: MerakFlowEdge[] = [
      { id: "e-internal", source: "n1", target: "n2" },
      { id: "e-external", source: "n2", target: "n3" },
    ];

    let seq = 0;
    const result = duplicateCanvasSelection([n1, n2, n3], edges, ["n1", "n2"], (p) => `${p}-copy-${++seq}`);
    expect(result.duplicatedIds).toEqual(["text-copy-1", "text-copy-2"]);
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(3);
    expect(result.edges[2]).toMatchObject({
      source: "text-copy-1",
      target: "text-copy-2",
    });
    expect(result.nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([
      "text-copy-1",
      "text-copy-2",
    ]);
  });

  it("manages bounded undo/redo history and deduplicates consecutive identical snapshots", () => {
    let h = createCanvasHistory("s0");
    h = pushCanvasHistory(h, "s0");
    expect(h.past).toHaveLength(0);

    for (let i = 1; i <= CANVAS_HISTORY_LIMIT + 10; i++) {
      h = pushCanvasHistory(h, `s${i}`);
    }
    expect(h.past).toHaveLength(CANVAS_HISTORY_LIMIT);
    expect(h.present).toBe(`s${CANVAS_HISTORY_LIMIT + 10}`);

    h = undoCanvasHistory(h);
    expect(h.present).toBe(`s${CANVAS_HISTORY_LIMIT + 9}`);
    expect(h.future).toEqual([`s${CANVAS_HISTORY_LIMIT + 10}`]);

    h = redoCanvasHistory(h);
    expect(h.present).toBe(`s${CANVAS_HISTORY_LIMIT + 10}`);
    expect(h.future).toHaveLength(0);

    h = pushCanvasHistory(undoCanvasHistory(h), "branch");
    expect(h.future).toHaveLength(0);
    expect(h.present).toBe("branch");
  });
});
