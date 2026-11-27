import { MERAK_ARTIFACT_CSS, UI_SDK_MANIFEST } from "@merak/ui/artifact";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const UI_SDK_MANIFEST_RESOURCE_URI = "merak://ui-sdk/manifest";
export const UI_SDK_CSS_RESOURCE_URI = "merak://ui-sdk/merak-ui.css";

/**
 * Registers read-only MCP resources exposing Merak's @merak/ui SDK manifest and
 * HTML Artifact CSS tokens so connected agents can discover UI conventions.
 */
export function registerMcpResources(server: McpServer): void {
  server.registerResource(
    "ui-sdk-manifest",
    UI_SDK_MANIFEST_RESOURCE_URI,
    {
      title: "Merak UI SDK Manifest",
      description:
        "Machine-readable manifest of @merak/ui primitives, .mk-* artifact classes, design tokens, and HTML Artifact runtime endpoints (/ui-sdk/web.css, /ui-sdk/merak-ui.css, /ui-sdk/merak-artifact.js, /ui-sdk/manifest.json).",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(UI_SDK_MANIFEST, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "ui-sdk-merak-css",
    UI_SDK_CSS_RESOURCE_URI,
    {
      title: "Merak Artifact Stylesheet (merak-ui.css)",
      description:
        "Reference stylesheet defining var(--mk-*) design tokens and .mk-* utility classes loaded at /ui-sdk/merak-ui.css for sandboxed HTML Artifacts.",
      mimeType: "text/css",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/css",
          text: MERAK_ARTIFACT_CSS,
        },
      ],
    }),
  );
}
