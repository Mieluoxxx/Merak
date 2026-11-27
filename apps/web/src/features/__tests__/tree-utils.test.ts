import type { NodeSummaryDto } from "@merak/shared";
import { describe, expect, it } from "vitest";
import {
  buildNodeTree,
  collectVisibleNodeIds,
  computeMovePlan,
  getAncestorIds,
  getDescendantIds,
  isDescendant,
} from "../../layout/tree-utils.js";

function makeNode(
  id: string,
  overrides: Partial<NodeSummaryDto> = {},
): NodeSummaryDto {
  return {
    id,
    spaceId: "space-1",
    parentId: null,
    type: "doc",
    title: `Node ${id}`,
    icon: null,
    sortOrder: "i",
    version: 1,
    updatedAt: "2026-11-27T00:00:00.000Z",
    updatedBy: "user-1",
    ...overrides,
  };
}

describe("tree-utils", () => {
  it("builds a nested tree from flat nodes sorted lexicographically by sortOrder", () => {
    const flat: NodeSummaryDto[] = [
      makeNode("b", { sortOrder: "m", title: "Second" }),
      makeNode("a", { sortOrder: "a", title: "First" }),
      makeNode("a2", { parentId: "a", sortOrder: "z", title: "Child 2" }),
      makeNode("a1", { parentId: "a", sortOrder: "c", title: "Child 1" }),
      makeNode("a1-sub", { parentId: "a1", sortOrder: "i", title: "Grandchild" }),
    ];

    const roots = buildNodeTree(flat);
    expect(roots.map((n) => n.id)).toEqual(["a", "b"]);
    expect(roots[0]?.children.map((n) => n.id)).toEqual(["a1", "a2"]);
    expect(roots[0]?.children[0]?.children.map((n) => n.id)).toEqual(["a1-sub"]);
    expect(roots[0]?.hasChildren).toBe(true);
    expect(roots[1]?.hasChildren).toBe(false);
  });

  it("handles cyclic server input without infinite recursion", () => {
    const corrupt = [
      makeNode("x", { parentId: "y", sortOrder: "a" }),
      makeNode("y", { parentId: "x", sortOrder: "b" }),
    ];
    const roots = buildNodeTree(corrupt);
    expect(roots.length).toBeGreaterThan(0);
  });

  it("detects descendants and self to enforce client-side cycle prevention", () => {
    const roots = buildNodeTree([
      makeNode("root", { sortOrder: "a" }),
      makeNode("child", { parentId: "root", sortOrder: "b" }),
      makeNode("grandchild", { parentId: "child", sortOrder: "c" }),
      makeNode("sibling", { sortOrder: "m" }),
    ]);

    expect(isDescendant(roots, "root", "root")).toBe(true);
    expect(isDescendant(roots, "root", "child")).toBe(true);
    expect(isDescendant(roots, "root", "grandchild")).toBe(true);
    expect(isDescendant(roots, "root", "sibling")).toBe(false);
    expect(isDescendant(roots, "child", "root")).toBe(false);
    expect([...getDescendantIds(roots, "root")].sort()).toEqual([
      "child",
      "grandchild",
      "root",
    ]);
  });

  it("computes LexoRank move plans for before, after, and inside reparenting", () => {
    const roots = buildNodeTree([
      makeNode("n1", { sortOrder: "c" }),
      makeNode("n2", { sortOrder: "i" }),
      makeNode("n3", { sortOrder: "r" }),
      makeNode("n2-a", { parentId: "n2", sortOrder: "h" }),
    ]);

    // Reorder n3 before n2 (between n1="c" and n2="i")
    const beforePlan = computeMovePlan(roots, "n3", "n2", "before");
    expect(beforePlan).not.toBeNull();
    expect(beforePlan!.parentId).toBeNull();
    expect(beforePlan!.beforeNodeId).toBe("n1");
    expect(beforePlan!.afterNodeId).toBe("n2");
    expect(beforePlan!.sortOrder > "c").toBe(true);
    expect(beforePlan!.sortOrder < "i").toBe(true);

    // Reorder n1 after n2 (between n2="i" and n3="r")
    const afterPlan = computeMovePlan(roots, "n1", "n2", "after");
    expect(afterPlan).not.toBeNull();
    expect(afterPlan!.parentId).toBeNull();
    expect(afterPlan!.beforeNodeId).toBe("n2");
    expect(afterPlan!.afterNodeId).toBe("n3");
    expect(afterPlan!.sortOrder > "i").toBe(true);
    expect(afterPlan!.sortOrder < "r").toBe(true);

    // Reparent n1 inside n2 (appended after existing child n2-a="h")
    const insidePlan = computeMovePlan(roots, "n1", "n2", "inside");
    expect(insidePlan).not.toBeNull();
    expect(insidePlan!.parentId).toBe("n2");
    expect(insidePlan!.beforeNodeId).toBe("n2-a");
    expect(insidePlan!.afterNodeId).toBeNull();
    expect(insidePlan!.sortOrder > "h").toBe(true);
  });

  it("rejects cyclic moves when moving a node into or adjacent to its own descendant", () => {
    const roots = buildNodeTree([
      makeNode("parent", { sortOrder: "a" }),
      makeNode("child", { parentId: "parent", sortOrder: "b" }),
      makeNode("grandchild", { parentId: "child", sortOrder: "c" }),
    ]);

    expect(computeMovePlan(roots, "parent", "child", "inside")).toBeNull();
    expect(computeMovePlan(roots, "parent", "grandchild", "inside")).toBeNull();
    expect(computeMovePlan(roots, "parent", "grandchild", "before")).toBeNull();
    expect(computeMovePlan(roots, "parent", "parent", "after")).toBeNull();
  });

  it("collects visible node IDs and ancestor chains", () => {
    const roots = buildNodeTree([
      makeNode("r1", { sortOrder: "a" }),
      makeNode("c1", { parentId: "r1", sortOrder: "b" }),
      makeNode("g1", { parentId: "c1", sortOrder: "c" }),
      makeNode("r2", { sortOrder: "m" }),
    ]);

    expect(collectVisibleNodeIds(roots, new Set())).toEqual(["r1", "r2"]);
    expect(collectVisibleNodeIds(roots, new Set(["r1"]))).toEqual(["r1", "c1", "r2"]);
    expect(collectVisibleNodeIds(roots, new Set(["r1", "c1"]))).toEqual([
      "r1",
      "c1",
      "g1",
      "r2",
    ]);
    expect(getAncestorIds(roots, "g1")).toEqual(["c1", "r1"]);
  });
});
