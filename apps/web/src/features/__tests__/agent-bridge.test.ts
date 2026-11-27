import { describe, expect, it, vi } from "vitest";
import {
  MERAK_WORKBENCH_TOOL_SCHEMAS,
  initMerakAgentBridge,
  type MerakWorkbenchStateSnapshot,
} from "../agent/bridge.js";

describe("UI SDK Agent Bridge", () => {
  it("exposes UI SDK snapshot/query/act primitives and Merak workbench tools", async () => {
    const state: MerakWorkbenchStateSnapshot = {
      activeView: "workspace",
      activeSpaceId: "space-kb",
      activeNodeId: "node-1",
      theme: "dark",
      commandPaletteOpen: false,
      realtimeState: "open",
      hasConflict: false,
      spaces: [{ id: "space-kb", name: "Engineering Wiki", kind: "knowledge" }],
    };

    const navigateNode = vi.fn();
    const switchSpace = vi.fn();
    const openCommandPalette = vi.fn();
    const openView = vi.fn();

    const bridge = initMerakAgentBridge({
      handlers: {
        getState: () => state,
        navigateNode,
        switchSpace,
        openCommandPalette,
        openView,
      },
      exposeWindowGlobal: false,
      registerWebMcp: false,
    });

    expect(typeof bridge.snapshot).toBe("function");
    expect(typeof bridge.query).toBe("function");
    expect(typeof bridge.act).toBe("function");
    expect(bridge.merakTools).toHaveLength(MERAK_WORKBENCH_TOOL_SCHEMAS.length);
    expect(bridge.allTools.length).toBeGreaterThanOrEqual(
      MERAK_WORKBENCH_TOOL_SCHEMAS.length + 3,
    );

    const fetchedState = await bridge.invokeTool("merak.getState");
    expect(fetchedState).toEqual(state);

    await bridge.invokeTool("merak.navigateNode", {
      nodeId: "node-42",
      spaceId: "space-kb",
    });
    expect(navigateNode).toHaveBeenCalledWith("node-42", "space-kb");

    await bridge.invokeTool("merak.switchSpace", { spaceId: "space-proj" });
    expect(switchSpace).toHaveBeenCalledWith("space-proj");

    await bridge.invokeTool("merak.openCommandPalette", {
      open: true,
      query: "architecture",
    });
    expect(openCommandPalette).toHaveBeenCalledWith({
      open: true,
      query: "architecture",
    });

    await bridge.invokeTool("merak.openView", { view: "gallery" });
    expect(openView).toHaveBeenCalledWith("gallery");

    await expect(bridge.invokeTool("merak.openView", { view: "invalid" })).rejects.toThrow(
      /Invalid view/,
    );
    await expect(bridge.invokeTool("merak.unknown")).rejects.toThrow(/Unknown Merak agent tool/);

    expect(Array.isArray(bridge.snapshot())).toBe(true);
    bridge.dispose();
  });
});
