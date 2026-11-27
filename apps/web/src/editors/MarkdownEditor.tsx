import "@blocknote/ariakit/style.css";
import { BlockNoteView } from "@blocknote/ariakit";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import {
  type AssetEditorProps,
  extractCanvasText,
  extractExcalidrawText,
  type NodeDetailDto,
  type NodeType,
} from "@merak/shared";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  Field,
  FieldLabel,
  Inline,
  Input,
  Stack,
  Toolbar,
} from "@merak/ui";
import { colors, font, radius, shadow, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Blocks,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FileText,
  Link2,
  Network,
  PenTool,
  Save,
  Sparkles,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseCanvasContent } from "./canvasHelpers.js";
import "./editors.css";
import { countActiveExcalidrawElements, parseExcalidrawContent } from "./excalidrawHelpers.js";
import {
  HTML_ARTIFACT_SANDBOX,
  injectUiSdkIntoHtml,
  parseArtifactBridgeMessage,
} from "./htmlHelpers.js";
import {
  clampEmbedHeight,
  DEFAULT_EMBED_HEIGHT,
  extractDocExcerpt,
  formatChildDirective,
  formatEmbedDirective,
  joinMarkdownSegments,
  splitMarkdownWithDirectives,
} from "./markdownHelpers.js";
import { formatMediaUrl, isNodeType, NODE_TYPE_META, useGlobalSaveShortcut } from "./shared.js";

interface MarkdownBlockContextValue {
  theme: "light" | "dark";
  onOpenNode: (nodeId: string) => void;
  resolveNode?: (nodeId: string) => Promise<NodeDetailDto | null>;
}

const MarkdownBlockContext = createContext<MarkdownBlockContextValue>({
  theme: "light",
  onOpenNode: () => {},
});

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: "440px",
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.md,
    backgroundColor: colors.bgSubtle,
    borderBottom: `1px solid ${colors.border}`,
  },
  titleText: {
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
    maxWidth: "240px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  hintText: {
    fontSize: font.sizeXs,
    color: colors.textSubtle,
  },
  editorScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    backgroundColor: colors.bg,
  },
  childCardButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgSubtle,
    color: colors.text,
    cursor: "pointer",
    textAlign: "left",
    marginBlock: space.xs,
    transition: "background-color 120ms ease, border-color 120ms ease",
  },
  childCardTitle: {
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
  },
  embedShell: {
    width: "100%",
    marginBlock: space.sm,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgElevated,
    boxShadow: shadow.sm,
    overflow: "hidden",
  },
  embedHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingBlock: space.xs,
    paddingInline: space.md,
    backgroundColor: colors.bgSubtle,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  embedTitle: {
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
  },
  embedBody: {
    padding: space.md,
    fontSize: font.sizeSm,
    lineHeight: 1.55,
    color: colors.textMuted,
  },
  embedIframeWrap: {
    width: "100%",
    backgroundColor: colors.bg,
  },
  embedIframe: {
    display: "block",
    width: "100%",
    height: "100%",
    border: "none",
  },
  excerptText: {
    margin: 0,
    whiteSpace: "pre-wrap",
    color: colors.textMuted,
    fontSize: font.sizeSm,
    lineHeight: 1.6,
  },
  dialogBackdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    zIndex: 300,
  },
  dialogContent: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(440px, calc(100vw - 32px))",
    backgroundColor: colors.bgElevated,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    boxShadow: shadow.lg,
    padding: space.xl,
    zIndex: 310,
  },
  dialogTitle: {
    margin: 0,
    fontSize: font.sizeLg,
    fontWeight: 600,
  },
  dialogDesc: {
    margin: 0,
    fontSize: font.sizeSm,
    color: colors.textMuted,
  },
  dialogActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: space.sm,
    marginTop: space.md,
  },
});

function NodeTypeIcon({ type, size = 15 }: { type: NodeType; size?: number }) {
  switch (type) {
    case "doc":
      return <FileText size={size} />;
    case "excalidraw":
      return <PenTool size={size} />;
    case "html":
      return <Blocks size={size} />;
    case "canvas":
      return <Network size={size} />;
  }
}

function ChildNodeCardView({
  nodeId,
  nodeType,
  title,
}: {
  nodeId: string;
  nodeType: NodeType;
  title: string;
}) {
  const { onOpenNode } = useContext(MarkdownBlockContext);
  const meta = NODE_TYPE_META[nodeType];

  return (
    <button
      type="button"
      contentEditable={false}
      onClick={() => {
        if (nodeId) onOpenNode(nodeId);
      }}
      {...stylex.props(styles.childCardButton)}
    >
      <Inline gap="sm">
        <NodeTypeIcon type={nodeType} size={16} />
        <span {...stylex.props(styles.childCardTitle)}>{title || meta.defaultChildTitle}</span>
        <Badge tone="accent">{meta.shortLabel}</Badge>
      </Inline>
      <Inline gap="xs">
        <span {...stylex.props(styles.hintText)}>Open</span>
        <ChevronRight size={15} />
      </Inline>
    </button>
  );
}

function EmbeddedHtmlPreview({
  node,
  height,
  theme,
}: {
  node: NodeDetailDto;
  height: number;
  theme: "light" | "dark";
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDoc = useMemo(() => injectUiSdkIntoHtml(node.content), [node.content]);

  const sendTheme = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: "merak:theme", theme }, "*");
    } catch {
      // Ignore detached iframe postMessage failures.
    }
  }, [theme]);

  useEffect(() => {
    sendTheme();
  }, [sendTheme]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const parsed = parseArtifactBridgeMessage(event.data);
      if (parsed?.type === "merak:ready") {
        sendTheme();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendTheme]);

  return (
    <div style={{ height: `${height}px` }} {...stylex.props(styles.embedIframeWrap)}>
      <iframe
        ref={iframeRef}
        title={`Embedded HTML Artifact: ${node.title}`}
        sandbox={HTML_ARTIFACT_SANDBOX}
        srcDoc={srcDoc}
        onLoad={sendTheme}
        {...stylex.props(styles.embedIframe)}
      />
    </div>
  );
}

function EmbeddedNodeView({ nodeId, height }: { nodeId: string; height: number }) {
  const { onOpenNode, resolveNode, theme } = useContext(MarkdownBlockContext);
  const [resolved, setResolved] = useState<NodeDetailDto | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  useEffect(() => {
    if (!nodeId || !resolveNode) {
      setResolved(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    resolveNode(nodeId)
      .then((detail) => {
        if (cancelled) return;
        setResolved(detail);
        setStatus("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setResolved(null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [nodeId, resolveNode]);

  const renderPreviewBody = () => {
    if (!nodeId) {
      return (
        <EmptyState
          title="Missing embedded node ID"
          description="Specify a valid node ID in ::embed{node=...}."
        />
      );
    }
    if (!resolveNode) {
      return (
        <div {...stylex.props(styles.embedBody)}>
          <Inline justify="between">
            <span>Embedded node `{nodeId}` (preview resolver unavailable)</span>
            <Button onClick={() => onOpenNode(nodeId)}>
              <ExternalLink size={13} />
              Open
            </Button>
          </Inline>
        </div>
      );
    }
    if (status === "loading") {
      return <div {...stylex.props(styles.embedBody)}>Loading embedded node preview…</div>;
    }
    if (status === "error" || !resolved) {
      return (
        <EmptyState
          title="Embedded node not found"
          description={`Could not resolve node "${nodeId}".`}
          action={
            <Button onClick={() => onOpenNode(nodeId)}>
              <ExternalLink size={13} />
              Open Node
            </Button>
          }
        />
      );
    }

    switch (resolved.type) {
      case "doc":
        return (
          <div {...stylex.props(styles.embedBody)}>
            <p {...stylex.props(styles.excerptText)}>{extractDocExcerpt(resolved.content, 360)}</p>
          </div>
        );
      case "excalidraw": {
        const scene = parseExcalidrawContent(resolved.content);
        const count = countActiveExcalidrawElements(scene);
        const textPreview = extractExcalidrawText(resolved.content);
        return (
          <div {...stylex.props(styles.embedBody)}>
            <Stack gap="sm">
              <Inline gap="sm">
                <Badge tone="accent">Excalidraw Whiteboard</Badge>
                <Badge tone="neutral">
                  {count} {count === 1 ? "element" : "elements"}
                </Badge>
              </Inline>
              {textPreview ? (
                <p {...stylex.props(styles.excerptText)}>{textPreview.slice(0, 240)}</p>
              ) : (
                <p {...stylex.props(styles.excerptText)}>
                  Visual diagram ready — click Open to inspect or edit on the whiteboard.
                </p>
              )}
            </Stack>
          </div>
        );
      }
      case "html":
        return <EmbeddedHtmlPreview node={resolved} height={height} theme={theme} />;
      case "canvas": {
        const canvasDoc = parseCanvasContent(resolved.content);
        const textSummary = extractCanvasText(resolved.content);
        return (
          <div {...stylex.props(styles.embedBody)}>
            <Stack gap="sm">
              <Inline gap="sm">
                <Badge tone="accent">JSON Canvas 1.0</Badge>
                <Badge tone="neutral">{canvasDoc.nodes.length} nodes</Badge>
                <Badge tone="neutral">{canvasDoc.edges.length} edges</Badge>
              </Inline>
              {textSummary ? (
                <p {...stylex.props(styles.excerptText)}>{textSummary.slice(0, 240)}</p>
              ) : (
                <p {...stylex.props(styles.excerptText)}>
                  Infinite canvas board — click Open to explore spatial nodes and connections.
                </p>
              )}
            </Stack>
          </div>
        );
      }
    }
  };

  const resolvedType: NodeType = resolved?.type ?? "doc";

  return (
    <div contentEditable={false} {...stylex.props(styles.embedShell)}>
      <div {...stylex.props(styles.embedHeader)}>
        <Inline gap="sm">
          <NodeTypeIcon type={resolvedType} size={15} />
          <span {...stylex.props(styles.embedTitle)}>
            {resolved?.title ?? `Node ${nodeId}`}
          </span>
          <Badge tone="neutral">
            {resolved ? NODE_TYPE_META[resolved.type].shortLabel : "Embed"}
          </Badge>
        </Inline>
        <Button onClick={() => onOpenNode(nodeId)}>
          <ExternalLink size={13} />
          Open
        </Button>
      </div>
      {renderPreviewBody()}
    </div>
  );
}

const createMerakChildBlock = createReactBlockSpec(
  {
    type: "merakChild",
    propSchema: {
      nodeId: { default: "" },
      nodeType: {
        default: "doc" as const,
        values: ["doc", "excalidraw", "html", "canvas"] as const,
      },
      title: { default: "Untitled Page" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const nodeType = isNodeType(props.block.props.nodeType)
        ? props.block.props.nodeType
        : "doc";
      return (
        <ChildNodeCardView
          nodeId={props.block.props.nodeId}
          nodeType={nodeType}
          title={props.block.props.title}
        />
      );
    },
    toExternalHTML: (props) => {
      const nodeType = isNodeType(props.block.props.nodeType)
        ? props.block.props.nodeType
        : "doc";
      return (
        <p data-merak-child={props.block.props.nodeId}>
          {formatChildDirective({
            nodeId: props.block.props.nodeId,
            nodeType,
            title: props.block.props.title,
          })}
        </p>
      );
    },
  },
);

const createMerakEmbedBlock = createReactBlockSpec(
  {
    type: "merakEmbed",
    propSchema: {
      nodeId: { default: "" },
      height: { default: String(DEFAULT_EMBED_HEIGHT) },
    },
    content: "none",
  },
  {
    render: (props) => (
      <EmbeddedNodeView
        nodeId={props.block.props.nodeId}
        height={clampEmbedHeight(props.block.props.height)}
      />
    ),
    toExternalHTML: (props) => (
      <p data-merak-embed={props.block.props.nodeId}>
        {formatEmbedDirective({
          nodeId: props.block.props.nodeId,
          height: clampEmbedHeight(props.block.props.height),
        })}
      </p>
    ),
  },
);

const merakMarkdownSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    merakChild: createMerakChildBlock(),
    merakEmbed: createMerakEmbedBlock(),
  },
});

type MerakMarkdownEditorInstance = typeof merakMarkdownSchema.BlockNoteEditor;
type MerakPartialBlock = typeof merakMarkdownSchema.PartialBlock;

function serializeEditorToMerakMarkdown(editor: MerakMarkdownEditorInstance): string {
  const parts: string[] = [];
  let standardGroup: typeof editor.document = [];

  const flushStandardGroup = () => {
    if (standardGroup.length === 0) return;
    const md = editor.blocksToMarkdownLossy(standardGroup);
    if (md.trim().length > 0) {
      parts.push(md.trim());
    }
    standardGroup = [];
  };

  for (const block of editor.document) {
    if (block.type === "merakChild") {
      flushStandardGroup();
      if (block.props.nodeId) {
        parts.push(
          formatChildDirective({
            nodeId: block.props.nodeId,
            nodeType: isNodeType(block.props.nodeType) ? block.props.nodeType : "doc",
            title: block.props.title,
          }),
        );
      }
    } else if (block.type === "merakEmbed") {
      flushStandardGroup();
      if (block.props.nodeId) {
        parts.push(
          formatEmbedDirective({
            nodeId: block.props.nodeId,
            height: clampEmbedHeight(block.props.height),
          }),
        );
      }
    } else {
      standardGroup.push(block);
    }
  }

  flushStandardGroup();
  return joinMarkdownSegments(parts);
}

function parseMerakMarkdownToBlocks(
  editor: MerakMarkdownEditorInstance,
  markdown: string,
): MerakPartialBlock[] {
  const segments = splitMarkdownWithDirectives(markdown);
  if (segments.length === 0) {
    return [{ type: "paragraph" }];
  }

  const blocks: MerakPartialBlock[] = [];
  for (const segment of segments) {
    if (segment.kind === "child") {
      blocks.push({
        type: "merakChild",
        props: {
          nodeId: segment.nodeId,
          nodeType: segment.nodeType,
          title: segment.title,
        },
      });
    } else if (segment.kind === "embed") {
      blocks.push({
        type: "merakEmbed",
        props: {
          nodeId: segment.nodeId,
          height: String(segment.height),
        },
      });
    } else {
      const parsed = editor.tryParseMarkdownToBlocks(segment.markdown);
      blocks.push(...parsed);
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "paragraph" }];
}

export function MarkdownEditor({
  node,
  readOnly = false,
  theme,
  onChange,
  onSave,
  onUploadMedia,
  onCreateChild,
  onOpenNode,
  resolveNode,
}: AssetEditorProps) {
  const [saving, setSaving] = useState(false);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [embedNodeId, setEmbedNodeId] = useState("");
  const [embedHeight, setEmbedHeight] = useState(String(DEFAULT_EMBED_HEIGHT));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const onUploadMediaRef = useRef(onUploadMedia);
  onUploadMediaRef.current = onUploadMedia;

  const onCreateChildRef = useRef(onCreateChild);
  onCreateChildRef.current = onCreateChild;

  const isHydratingRef = useRef(false);
  const lastEmittedMarkdownRef = useRef<string>(node.content);

  const editor = useCreateBlockNote(
    {
      schema: merakMarkdownSchema,
      uploadFile: async (file: File) => {
        const media = await onUploadMediaRef.current(file);
        return formatMediaUrl(media);
      },
    },
    [],
  );

  // Hydrate BlockNote blocks from clean Markdown on mount and whenever `node.id` changes.
  useEffect(() => {
    isHydratingRef.current = true;
    try {
      const nextBlocks = parseMerakMarkdownToBlocks(editor, node.content);
      editor.replaceBlocks(editor.document, nextBlocks);
      lastEmittedMarkdownRef.current = node.content;
    } finally {
      queueMicrotask(() => {
        isHydratingRef.current = false;
      });
    }
  }, [editor, node.id]);

  const handleEditorChange = useCallback(() => {
    if (isHydratingRef.current || readOnly) return;
    const nextMarkdown = serializeEditorToMerakMarkdown(editor);
    if (nextMarkdown !== lastEmittedMarkdownRef.current) {
      lastEmittedMarkdownRef.current = nextMarkdown;
      onChangeRef.current(nextMarkdown);
    }
  }, [editor, readOnly]);

  const handleSave = useCallback(async () => {
    if (!onSaveRef.current || readOnly) return;
    setSaving(true);
    try {
      const nextMarkdown = serializeEditorToMerakMarkdown(editor);
      lastEmittedMarkdownRef.current = nextMarkdown;
      await onSaveRef.current(nextMarkdown);
    } finally {
      setSaving(false);
    }
  }, [editor, readOnly]);

  useGlobalSaveShortcut(Boolean(onSave) && !readOnly, handleSave);

  const createAndInsertChildBlock = useCallback(
    async (type: NodeType, defaultTitle: string) => {
      if (readOnly) return;
      const created = await onCreateChildRef.current({ type, title: defaultTitle });
      insertOrUpdateBlockForSlashMenu(editor, {
        type: "merakChild",
        props: {
          nodeId: created.id,
          nodeType: created.type,
          title: created.title,
        },
      });
    },
    [editor, readOnly],
  );

  const handleConfirmEmbed = useCallback(() => {
    const trimmedId = embedNodeId.trim();
    if (!trimmedId) return;
    const clamped = clampEmbedHeight(embedHeight);
    insertOrUpdateBlockForSlashMenu(editor, {
      type: "merakEmbed",
      props: {
        nodeId: trimmedId,
        height: String(clamped),
      },
    });
    setEmbedNodeId("");
    setEmbedHeight(String(DEFAULT_EMBED_HEIGHT));
    setEmbedDialogOpen(false);
  }, [editor, embedHeight, embedNodeId]);

  const getCustomSlashMenuItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const defaultItems = getDefaultReactSlashMenuItems(editor);
      const merakItems: DefaultReactSuggestionItem[] = [
        {
          title: "Subpage",
          subtext: "Create and link a nested Markdown document",
          aliases: ["subpage", "page", "doc", "child"],
          group: "Merak",
          icon: <FileText size={16} />,
          onItemClick: () => {
            void createAndInsertChildBlock("doc", "Untitled Page");
          },
        },
        {
          title: "Sub-Excalidraw",
          subtext: "Create and link a nested Excalidraw whiteboard",
          aliases: ["sub-excalidraw", "excalidraw", "whiteboard", "diagram"],
          group: "Merak",
          icon: <PenTool size={16} />,
          onItemClick: () => {
            void createAndInsertChildBlock("excalidraw", "Untitled Whiteboard");
          },
        },
        {
          title: "Sub-HTML Artifact",
          subtext: "Create and link a sandboxed interactive HTML artifact",
          aliases: ["sub-html", "html", "artifact", "widget"],
          group: "Merak",
          icon: <Blocks size={16} />,
          onItemClick: () => {
            void createAndInsertChildBlock("html", "Untitled Artifact");
          },
        },
        {
          title: "Sub-Canvas",
          subtext: "Create and link a nested JSON Canvas 1.0 board",
          aliases: ["sub-canvas", "canvas", "board"],
          group: "Merak",
          icon: <Network size={16} />,
          onItemClick: () => {
            void createAndInsertChildBlock("canvas", "Untitled Canvas");
          },
        },
        {
          title: "Embed Node",
          subtext: "Embed an inline live preview of another Merak node",
          aliases: ["embed", "include", "preview"],
          group: "Merak",
          icon: <Link2 size={16} />,
          onItemClick: () => {
            setEmbedDialogOpen(true);
          },
        },
      ];

      return filterSuggestionItems([...merakItems, ...defaultItems], query);
    },
    [createAndInsertChildBlock, editor],
  );

  const blockContextValue = useMemo<MarkdownBlockContextValue>(
    () => ({ theme, onOpenNode, resolveNode }),
    [theme, onOpenNode, resolveNode],
  );

  return (
    <MarkdownBlockContext.Provider value={blockContextValue}>
      <section
        aria-label={`Markdown Editor: ${node.title}`}
        {...stylex.props(styles.root)}
      >
        <Toolbar aria-label="Markdown toolbar" {...stylex.props(styles.toolbar)}>
          <Inline gap="sm">
            <FileText size={16} />
            <span {...stylex.props(styles.titleText)}>{node.title}</span>
            <Badge tone="accent">Markdown</Badge>
            {readOnly ? (
              <Badge tone="neutral">Read-only</Badge>
            ) : (
              <span {...stylex.props(styles.hintText)}>
                Type / for subpages, embeds &amp; blocks
              </span>
            )}
          </Inline>

          <Inline gap="xs">
            {!readOnly ? (
              <>
                <Button
                  onClick={() => void createAndInsertChildBlock("doc", "Untitled Page")}
                  aria-label="Insert subpage"
                >
                  <FilePlus2 size={14} />
                  Subpage
                </Button>
                <Button
                  onClick={() => setEmbedDialogOpen(true)}
                  aria-label="Embed node"
                >
                  <Sparkles size={14} />
                  Embed
                </Button>
              </>
            ) : null}
            {onSave && !readOnly ? (
              <Button disabled={saving} onClick={handleSave}>
                <Save size={14} />
                {saving ? "Saving..." : "Save"}
              </Button>
            ) : null}
          </Inline>
        </Toolbar>

        <div
          className="merak-bn-container"
          data-merak-theme={theme}
          {...stylex.props(styles.editorScroll)}
        >
          <BlockNoteView
            editor={editor}
            theme={theme}
            editable={!readOnly}
            slashMenu={false}
            onChange={handleEditorChange}
          >
            {!readOnly ? (
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={getCustomSlashMenuItems}
              />
            ) : null}
          </BlockNoteView>
        </div>

        <Dialog open={embedDialogOpen} onOpenChange={setEmbedDialogOpen}>
          <DialogBackdrop {...stylex.props(styles.dialogBackdrop)} />
          <DialogContent {...stylex.props(styles.dialogContent)}>
            <Stack gap="md">
              <Stack gap="xs">
                <DialogTitle {...stylex.props(styles.dialogTitle)}>
                  Embed Merak Node
                </DialogTitle>
                <DialogDescription {...stylex.props(styles.dialogDesc)}>
                  Insert a live <code>::embed&#123;node=&quot;...&quot;&#125;</code> preview block
                  for another document, whiteboard, HTML artifact, or canvas.
                </DialogDescription>
              </Stack>

              <Card variant="subtle" padding="sm">
                <Stack gap="sm">
                  <Field>
                    <FieldLabel>Target Node ID</FieldLabel>
                    <Input
                      value={embedNodeId}
                      onValueChange={setEmbedNodeId}
                      placeholder="e.g. node_abc123"
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Height (px)</FieldLabel>
                    <Input
                      type="number"
                      value={embedHeight}
                      onValueChange={setEmbedHeight}
                      placeholder={String(DEFAULT_EMBED_HEIGHT)}
                    />
                  </Field>
                </Stack>
              </Card>

              <div {...stylex.props(styles.dialogActions)}>
                <DialogClose>Cancel</DialogClose>
                <Button
                  disabled={embedNodeId.trim().length === 0}
                  onClick={handleConfirmEmbed}
                >
                  Insert Embed
                </Button>
              </div>
            </Stack>
          </DialogContent>
        </Dialog>
      </section>
    </MarkdownBlockContext.Provider>
  );
}
