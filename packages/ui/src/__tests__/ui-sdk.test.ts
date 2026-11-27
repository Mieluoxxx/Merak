import { describe, expect, it } from "vitest";
import { MERAK_ARTIFACT_CSS, MERAK_ARTIFACT_JS, UI_SDK_MANIFEST } from "../artifact/index.js";

describe("@merak/ui SDK manifest & artifact runtime", () => {
  it("lists Vercel Labs UI SDK upstream metadata and agent bridge APIs", () => {
    expect(UI_SDK_MANIFEST.upstream.package).toBe("@ui-sdk/react");
    expect(UI_SDK_MANIFEST.agentBridge.apis).toEqual([
      "createAgent",
      "agentTools",
      "registerTools",
    ]);
    expect(UI_SDK_MANIFEST.reactPrimitives).toContain("Tree");
    expect(UI_SDK_MANIFEST.reactPrimitives).toContain("Command");
  });

  it("includes UI SDK CSS variable alignment and mk-* utility classes", () => {
    expect(MERAK_ARTIFACT_CSS).toContain("--ui-background");
    expect(MERAK_ARTIFACT_CSS).toContain("color-scheme: light dark");
    for (const cls of UI_SDK_MANIFEST.artifactRuntime.cssClasses) {
      expect(MERAK_ARTIFACT_CSS).toContain(`.${cls}`);
    }
  });

  it("includes sandboxed iframe theme and console bridge handlers", () => {
    expect(MERAK_ARTIFACT_JS).toContain("merak:theme");
    expect(MERAK_ARTIFACT_JS).toContain("merak:console");
    expect(MERAK_ARTIFACT_JS).toContain("merak:ready");
    expect(MERAK_ARTIFACT_JS).toContain("MerakArtifact");
  });
});
