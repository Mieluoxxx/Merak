import { describe, expect, it } from "vitest";
import { extractAuthError, slugifyOrganizationName } from "../../lib/auth-client.js";
import {
  buildMediaListUrl,
  buildSearchUrl,
  buildSpacesUrl,
  formatBytes,
  shortHash,
  workspaceQueryKeys,
} from "../api/workspace-api.js";

describe("workspace API & auth helpers", () => {
  it("builds canonical query keys", () => {
    expect(workspaceQueryKeys.spaces()).toEqual(["spaces"]);
    expect(workspaceQueryKeys.spaces("project")).toEqual(["spaces", "project"]);
    expect(workspaceQueryKeys.tree("sp-1")).toEqual(["tree", "sp-1"]);
    expect(workspaceQueryKeys.node("nd-1")).toEqual(["node", "nd-1"]);
    expect(workspaceQueryKeys.media()).toEqual(["media"]);
    expect(workspaceQueryKeys.media({ orphansOnly: true })).toEqual(["media", "orphans"]);
    expect(workspaceQueryKeys.media({ spaceId: "sp-1" })).toEqual(["media", "space", "sp-1"]);
    expect(workspaceQueryKeys.mcpTokens()).toEqual(["mcp-tokens"]);
  });

  it("builds properly encoded API URLs", () => {
    expect(buildSpacesUrl()).toBe("/api/spaces");
    expect(buildSpacesUrl("knowledge")).toBe("/api/spaces?kind=knowledge");
    expect(buildMediaListUrl()).toBe("/api/media");
    expect(buildMediaListUrl({ orphansOnly: true })).toBe("/api/media/orphans");
    expect(buildMediaListUrl({ spaceId: "sp-1" })).toBe("/api/media?spaceId=sp-1");
    expect(buildSearchUrl("hello world", { spaceId: "sp-1", limit: 15 })).toBe(
      "/api/search?q=hello+world&spaceId=sp-1&limit=15",
    );
  });

  it("formats byte sizes, hashes, slugs, and auth errors", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(shortHash("abcdef1234567890", 8)).toBe("abcdef12");

    expect(slugifyOrganizationName("  Platform Engineering!!  ")).toBe("platform-engineering");
    expect(extractAuthError({ message: "Invalid password" })).toBe("Invalid password");
    expect(extractAuthError(null, "Fallback error")).toBe("Fallback error");
  });
});
