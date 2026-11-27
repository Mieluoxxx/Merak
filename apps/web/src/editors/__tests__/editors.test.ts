import type { JsonCanvasDocument } from "@merak/shared";
import { describe, expect, it } from "vitest";
import {
  CANVAS_LOD_ZOOM_THRESHOLD,
  canvasDocumentToFlow,
  flowToCanvasDocument,
  parseCanvasContent,
  shouldActivateCanvasLod,
} from "../canvasHelpers.js";
import {
  countActiveExcalidrawElements,
  parseExcalidrawContent,
  serializeExcalidrawDocument,
} from "../excalidrawHelpers.js";
import {
  HTML_ARTIFACT_SANDBOX,
  injectUiSdkIntoHtml,
  parseArtifactBridgeMessage,
  UI_SDK_ARTIFACT_JS_SRC,
  UI_SDK_MERAK_CSS_HREF,
  UI_SDK_WEB_CSS_HREF,
} from "../htmlHelpers.js";
import {
  DEFAULT_EMBED_HEIGHT,
  extractDocExcerpt,
  formatChildDirective,
  formatEmbedDirective,
  joinMarkdownSegments,
  MAX_EMBED_HEIGHT,
  MIN_EMBED_HEIGHT,
  parseMerakDirective,
  splitMarkdownWithDirectives,
} from "../markdownHelpers.js";

describe("HTML Artifact helpers", () => {
  it("enforces strict allow-scripts sandbox without allow-same-origin", () => {
    expect(HTML_ARTIFACT_SANDBOX).toBe("allow-scripts");
    expect(HTML_ARTIFACT_SANDBOX).not.toContain("allow-same-origin");
  });

  it("injects all three UI SDK assets into a full HTML document head", () => {
    const raw = `<!doctype html>
<html>
  <head>
    <title>Demo</title>
  </head>
  <body><div class="mk-page">Hello</div></body>
</html>`;

    const injected = injectUiSdkIntoHtml(raw);
    expect(injected).toContain(`<link rel="stylesheet" href="${UI_SDK_WEB_CSS_HREF}">`);
    expect(injected).toContain(`<link rel="stylesheet" href="${UI_SDK_MERAK_CSS_HREF}">`);
    expect(injected).toContain(`<script src="${UI_SDK_ARTIFACT_JS_SRC}"></script>`);
    expect(injected.indexOf(UI_SDK_WEB_CSS_HREF)).toBeGreaterThan(injected.indexOf("<head>"));
    expect(injected.indexOf(UI_SDK_ARTIFACT_JS_SRC)).toBeLessThan(injected.indexOf("</head>"));
  });

  it("injects a head block when <html> exists without <head>", () => {
    const raw = `<html><body><h1>No head</h1></body></html>`;
    const injected = injectUiSdkIntoHtml(raw);
    expect(injected).toContain("<head>");
    expect(injected).toContain("</head>");
    expect(injected).toContain(UI_SDK_WEB_CSS_HREF);
    expect(injected).toContain(UI_SDK_MERAK_CSS_HREF);
    expect(injected).toContain(UI_SDK_ARTIFACT_JS_SRC);
  });

  it("prepends UI SDK assets for HTML fragments without document wrappers", () => {
    const fragment = `<main class="mk-page"><h1>Widget</h1></main>`;
    const injected = injectUiSdkIntoHtml(fragment);
    expect(injected.startsWith(`<link rel="stylesheet" href="${UI_SDK_WEB_CSS_HREF}">`)).toBe(true);
    expect(injected).toContain(fragment);
  });

  it("does not duplicate UI SDK assets that are already referenced", () => {
    const partial = `<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="/ui-sdk/web.css">
  <script src='/ui-sdk/merak-artifact.js'></script>
</head>
<body>Hi</body>
</html>`;

    const injected = injectUiSdkIntoHtml(partial);
    expect(injected.match(/\/ui-sdk\/web\.css/g)?.length).toBe(1);
    expect(injected.match(/\/ui-sdk\/merak-ui\.css/g)?.length).toBe(1);
    expect(injected.match(/\/ui-sdk\/merak-artifact\.js/g)?.length).toBe(1);

    // Calling twice is idempotent.
    expect(injectUiSdkIntoHtml(injected)).toBe(injected);
  });

  it("parses merak:ready and merak:console messages with message or args", () => {
    expect(parseArtifactBridgeMessage({ type: "merak:ready" })).toEqual({
      type: "merak:ready",
    });

    expect(
      parseArtifactBridgeMessage({
        type: "merak:console",
        level: "error",
        message: "Boom",
      }),
    ).toEqual({
      type: "merak:console",
      level: "error",
      message: "Boom",
    });

    expect(
      parseArtifactBridgeMessage({
        type: "merak:console",
        level: "warn",
        args: ["count:", { value: 42 }],
      }),
    ).toEqual({
      type: "merak:console",
      level: "warn",
      message: 'count: {"value":42}',
    });

    expect(parseArtifactBridgeMessage({ type: "other:event" })).toBeNull();
    expect(parseArtifactBridgeMessage(null)).toBeNull();
  });
});

describe("Markdown directive helpers", () => {
  it("formats and parses ::child directives cleanly including escaped quotes", () => {
    const line = formatChildDirective({
      nodeId: "node_42",
      nodeType: "excalidraw",
      title: 'System "Core" Architecture',
    });

    expect(line).toBe(
      '::child{node="node_42" type="excalidraw" title="System \\"Core\\" Architecture"}',
    );
    expect(parseMerakDirective(line)).toEqual({
      kind: "child",
      nodeId: "node_42",
      nodeType: "excalidraw",
      title: 'System "Core" Architecture',
    });
  });

  it("formats and parses ::embed directives and clamps height bounds", () => {
    const line = formatEmbedDirective({ nodeId: "node_html_1", height: 460 });
    expect(line).toBe('::embed{node="node_html_1" height="460"}');
    expect(parseMerakDirective(line)).toEqual({
      kind: "embed",
      nodeId: "node_html_1",
      height: 460,
    });

    expect(parseMerakDirective('::embed{node="n1"}')).toEqual({
      kind: "embed",
      nodeId: "n1",
      height: DEFAULT_EMBED_HEIGHT,
    });
    expect(parseMerakDirective('::embed{node="n1" height="10"}')).toEqual({
      kind: "embed",
      nodeId: "n1",
      height: MIN_EMBED_HEIGHT,
    });
    expect(parseMerakDirective('::embed{node="n1" height="9999"}')).toEqual({
      kind: "embed",
      nodeId: "n1",
      height: MAX_EMBED_HEIGHT,
    });
  });

  it("splits markdown with directives while ignoring directives inside fenced code blocks", () => {
    const doc = [
      "# Spec Title",
      "",
      "Intro paragraph.",
      "",
      '::child{node="child_1" type="html" title="Interactive Prototype"}',
      "",
      "```markdown",
      '::embed{node="ignored_inside_fence" height="460"}',
      "```",
      "",
      '::embed{node="embed_2" height="520"}',
      "",
      "Closing notes.",
    ].join("\n");

    const segments = splitMarkdownWithDirectives(doc);
    expect(segments).toEqual([
      { kind: "markdown", markdown: "# Spec Title\n\nIntro paragraph." },
      {
        kind: "child",
        nodeId: "child_1",
        nodeType: "html",
        title: "Interactive Prototype",
      },
      {
        kind: "markdown",
        markdown: '```markdown\n::embed{node="ignored_inside_fence" height="460"}\n```',
      },
      {
        kind: "embed",
        nodeId: "embed_2",
        height: 520,
      },
      { kind: "markdown", markdown: "Closing notes." },
    ]);

    expect(
      joinMarkdownSegments(["# Heading", "", '::embed{node="e1" height="460"}', ""]),
    ).toBe('# Heading\n\n::embed{node="e1" height="460"}');
  });

  it("extracts readable doc excerpts without directive syntax", () => {
    const md = `# Overview\n\n::embed{node="abc" height="460"}\n\nCheck [the guide](https://example.com) for **details**.`;
    expect(extractDocExcerpt(md, 120)).toBe("Overview Check the guide for details.");
  });
});

describe("Excalidraw parse and serialize helpers", () => {
  it("handles empty, malformed, and invalid JSON content safely", () => {
    for (const raw of ["", "   ", "{bad json", "null", JSON.stringify({ elements: "nope" })]) {
      const doc = parseExcalidrawContent(raw);
      expect(doc.type).toBe("excalidraw");
      expect(doc.version).toBe(2);
      expect(doc.elements).toEqual([]);
      expect(countActiveExcalidrawElements(doc)).toBe(0);
    }
  });

  it("normalizes partial LLM-generated scenes via normalizeExcalidrawDocument", () => {
    const partial = JSON.stringify({
      elements: [
        { id: "rect-1", type: "rectangle", x: 10, y: 20 },
        { id: "txt-1", type: "text", x: 30, y: 40, text: "API Gateway" },
      ],
    });

    const doc = parseExcalidrawContent(partial);
    expect(doc.type).toBe("excalidraw");
    expect(doc.version).toBe(2);
    expect(doc.elements).toHaveLength(2);
    expect(countActiveExcalidrawElements(doc)).toBe(2);
    expect(doc.elements[0]?.width).toBe(180);
    expect(doc.elements[1]?.originalText).toBe("API Gateway");
  });

  it("serializes canonically, filters deleted elements, and replaces uploaded base64 files with /api/media/:id", () => {
    const serialized = serializeExcalidrawDocument({
      elements: [
        { id: "live-1", type: "rectangle", x: 0, y: 0, width: 120, height: 80, isDeleted: false },
        { id: "gone-1", type: "ellipse", x: 50, y: 50, isDeleted: true },
      ],
      appState: {
        viewBackgroundColor: "#ffffff",
        gridSize: 20,
        collaborators: new Map(),
        cursorButton: "up",
      },
      files: {
        media_99: {
          id: "media_99",
          mimeType: "image/png",
          dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
          created: 1700000000000,
        },
      },
      uploadedMediaMap: {
        media_99: "/api/media/media_99",
      },
    });

    const parsed = JSON.parse(serialized) as {
      type: string;
      version: number;
      elements: Array<{ id: string }>;
      appState: Record<string, unknown>;
      files: Record<string, { dataURL: string; mediaUrl?: string }>;
    };

    expect(parsed.type).toBe("excalidraw");
    expect(parsed.version).toBe(2);
    expect(parsed.elements.map((el) => el.id)).toEqual(["live-1"]);
    expect(parsed.appState.viewBackgroundColor).toBe("#ffffff");
    expect(parsed.appState.cursorButton).toBeUndefined();
    expect(parsed.files.media_99?.dataURL).toBe("/api/media/media_99");
    expect(parsed.files.media_99?.mediaUrl).toBe("/api/media/media_99");
  });
});

describe("JSON Canvas 1.0 bidirectional converters and LOD threshold", () => {
  it("parses empty or malformed canvas JSON into an empty document", () => {
    expect(parseCanvasContent("")).toEqual({ nodes: [], edges: [] });
    expect(parseCanvasContent("not json")).toEqual({ nodes: [], edges: [] });
    expect(parseCanvasContent(JSON.stringify({ nodes: "bad" }))).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("round-trips text, group, link, and file (nodeId/mediaId) nodes plus edges", () => {
    const sampleDoc: JsonCanvasDocument = {
      nodes: [
        {
          id: "g1",
          type: "group",
          x: 0,
          y: 0,
          width: 600,
          height: 400,
          label: "Architecture",
          color: "#2563eb",
        },
        {
          id: "t1",
          type: "text",
          x: 40,
          y: 60,
          width: 240,
          height: 140,
          text: "Core note content",
        },
        {
          id: "f_node",
          type: "file",
          x: 320,
          y: 60,
          width: 260,
          height: 180,
          file: "specs/api.md",
          subpath: "#auth",
          nodeId: "node_spec_1",
        },
        {
          id: "f_media",
          type: "file",
          x: 320,
          y: 260,
          width: 260,
          height: 180,
          file: "/api/media/med_7",
          mediaId: "med_7",
        },
        {
          id: "l1",
          type: "link",
          x: 40,
          y: 240,
          width: 240,
          height: 120,
          url: "https://jsoncanvas.org/spec/1.0/",
        },
      ],
      edges: [
        {
          id: "e1",
          fromNode: "t1",
          fromSide: "right",
          fromEnd: "none",
          toNode: "f_node",
          toSide: "left",
          toEnd: "arrow",
          label: "references",
          color: "#16a34a",
        },
      ],
    };

    const flow = canvasDocumentToFlow(sampleDoc);
    expect(flow.nodes).toHaveLength(5);
    expect(flow.nodes[0]?.id).toBe("g1");
    expect(flow.nodes[0]?.zIndex).toBe(-1);
    expect(flow.edges).toHaveLength(1);
    expect(flow.edges[0]?.sourceHandle).toBe("source-right");
    expect(flow.edges[0]?.targetHandle).toBe("target-left");

    const roundTripped = flowToCanvasDocument(flow.nodes, flow.edges);
    expect(roundTripped).toEqual(sampleDoc);
  });

  it("drops dangling edges when serializing back to JSON Canvas", () => {
    const flow = canvasDocumentToFlow({
      nodes: [
        { id: "n1", type: "text", x: 10, y: 10, width: 200, height: 120, text: "Only node" },
      ],
      edges: [],
    });

    const roundTripped = flowToCanvasDocument(flow.nodes, [
      { id: "dangling", source: "n1", target: "missing" },
    ]);
    expect(roundTripped.edges).toEqual([]);
  });

  it("evaluates LOD activation threshold accurately", () => {
    expect(CANVAS_LOD_ZOOM_THRESHOLD).toBe(0.65);
    expect(shouldActivateCanvasLod(0.5, true)).toBe(false);
    expect(shouldActivateCanvasLod(0.64, true)).toBe(false);
    expect(shouldActivateCanvasLod(0.65, false)).toBe(false);
    expect(shouldActivateCanvasLod(0.65, true)).toBe(true);
    expect(shouldActivateCanvasLod(1.2, true)).toBe(true);
    expect(shouldActivateCanvasLod(Number.NaN, true)).toBe(false);
  });
});
