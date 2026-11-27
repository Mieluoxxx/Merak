import "@blocknote/ariakit/style.css";
import { BlockNoteView } from "@blocknote/ariakit";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core";
import { SyntaxHighlightingExtension } from "@blocknote/core/extensions";
import {
  createReactBlockSpec,
  type DefaultReactSuggestionItem,
  FilePanelController,
  getDefaultReactSlashMenuItems,
  SideMenuController,
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
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuTrigger,
  Stack,
  Toolbar,
  toast,
} from "@merak/ui";
import { colors, font, radius, shadow, space, zIndex } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Blocks,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  CopyPlus,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListOrdered,
  Network,
  PenTool,
  Quote,
  Sparkles,
  Trash2,
  Type,
  X,
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
import { countWordsAndChars, extractBlocksPlainText } from "./blockMetrics.js";
import { cloneBlocksForDuplicate } from "./blockSelection.js";
import {
  DocAppearancePopover,
  loadDocAppearance,
  saveDocAppearance,
  type DocAppearanceSettings,
} from "./DocAppearancePopover.js";
import { createMerakCodeBlockSpec } from "./MerakCodeBlock.js";
import { createMerakCodeHighlighter } from "./codeHighlighter.js";
import { MerakFilePanel } from "./MerakFilePanel.js";
import { MerakSideMenu } from "./MerakSideMenu.js";
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
import { useBlockMarqueeSelection } from "./useBlockMarqueeSelection.js";

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
    backgroundColor: "transparent",
    color: colors.text,
    fontFamily: font.sans,
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 0,
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    width: "100%",
    maxWidth: "720px",
    marginInline: "auto",
    paddingBlock: "6px",
    paddingInline: "24px",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 0,
    flexShrink: 0,
  },
  toolbarAction: {
    height: "28px",
    paddingInline: "10px",
    fontSize: font.sizeXs,
  },
  hintText: {
    fontSize: font.sizeXs,
    color: colors.textSubtle,
  },
  editorScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    backgroundColor: "transparent",
  },
  childCardButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
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
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
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
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
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
    borderWidth: 0,
    borderStyle: "none",
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
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
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
  dialogFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "4px",
    paddingTop: "14px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
  marqueeBox: {
    position: "fixed",
    backgroundColor: "rgba(35, 131, 226, 0.14)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(35, 131, 226, 0.38)",
    borderRadius: "2px",
    pointerEvents: "none",
    zIndex: zIndex.dropdown,
  },
  batchBar: {
    position: "fixed",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    height: "36px",
    paddingBlock: 0,
    paddingInline: "6px",
    borderRadius: radius.md,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    boxShadow: shadow.md,
    zIndex: zIndex.popover,
    color: colors.text,
  },
  batchCount: {
    paddingInline: "8px",
    fontSize: font.sizeXs,
    fontWeight: 500,
    color: colors.textMuted,
    whiteSpace: "nowrap",
  },
  batchDivider: {
    width: "1px",
    height: "16px",
    backgroundColor: colors.borderSubtle,
    marginInline: "2px",
    flexShrink: 0,
  },
  batchActionButton: {
    height: "26px",
    paddingInline: "8px",
    fontSize: font.sizeXs,
    borderRadius: "6px",
  },
  batchDeleteButton: {
    height: "26px",
    paddingInline: "8px",
    fontSize: font.sizeXs,
    borderRadius: "6px",
    color: colors.danger,
  },
  batchCloseButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    padding: 0,
    borderRadius: "6px",
  },
  batchMenuContent: {
    minWidth: "200px",
  },
});

const NON_CONVERTIBLE_BLOCK_TYPES = new Set([
  "merakChild",
  "merakEmbed",
  "image",
  "file",
  "video",
  "audio",
  "table",
  "divider",
]);

function NodeTypeIcon({ type, size = 15 }: { type: NodeType; size?: number }) {
  switch (type) {
    case "folder":
      return <Folder size={size} />;
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
      case "folder":
        return (
          <div {...stylex.props(styles.embedBody)}>
            <p {...stylex.props(styles.excerptText)}>
              Workspace folder — click Open to browse nested pages and subfolders.
            </p>
          </div>
        );
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
        values: ["doc", "excalidraw", "html", "canvas", "folder"] as const,
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
    codeBlock: createMerakCodeBlockSpec(),
    merakChild: createMerakChildBlock(),
    merakEmbed: createMerakEmbedBlock(),
  },
});

type MerakMarkdownEditorInstance = typeof merakMarkdownSchema.BlockNoteEditor;
type MerakPartialBlock = typeof merakMarkdownSchema.PartialBlock;

function serializeEditorToMerakMarkdown(
  editor: MerakMarkdownEditorInstance,
  blocks: typeof editor.document = editor.document,
): string {
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

  for (const block of blocks) {
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
  const [docAppearance, setDocAppearance] = useState<DocAppearanceSettings>(() =>
    loadDocAppearance(),
  );
  const [activeHandleBlockId, setActiveHandleBlockId] = useState<string | null>(null);
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
  const hydratedNodeIdRef = useRef<string | null>(null);
  const lastEmittedMarkdownRef = useRef<string>(node.content);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const selectionControlRef = useRef<{
    setSelectedIds: (ids: string[]) => void;
    clearSelection: () => void;
  }>({
    setSelectedIds: () => {},
    clearSelection: () => {},
  });

  const syntaxHighlighting = useMemo(
    () =>
      SyntaxHighlightingExtension({
        createHighlighter: createMerakCodeHighlighter,
      }),
    [],
  );

  const editor = useCreateBlockNote(
    {
      schema: merakMarkdownSchema,
      extensions: [syntaxHighlighting],
      uploadFile: async (file: File) => {
        const media = await onUploadMediaRef.current(file);
        return formatMediaUrl(media);
      },
    },
    [],
  );

  // Hydrate BlockNote blocks from clean Markdown on mount, when `node.id` changes, or when server/draft content updates externally.
  useEffect(() => {
    if (
      hydratedNodeIdRef.current === node.id &&
      node.content === lastEmittedMarkdownRef.current
    ) {
      return;
    }
    hydratedNodeIdRef.current = node.id;
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
  }, [editor, node.id, node.content]);

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
    const nextMarkdown = serializeEditorToMerakMarkdown(editor);
    lastEmittedMarkdownRef.current = nextMarkdown;
    await onSaveRef.current(nextMarkdown);
  }, [editor, readOnly]);

  useGlobalSaveShortcut(Boolean(onSave) && !readOnly, handleSave);

  const handleAppearanceChange = useCallback((next: DocAppearanceSettings) => {
    setDocAppearance(next);
    saveDocAppearance(next);
  }, []);

  const handleCopyPageMarkdown = useCallback(async () => {
    try {
      const md = serializeEditorToMerakMarkdown(editor);
      await navigator.clipboard.writeText(md);
      toast.success("Copied page Markdown");
    } catch {
      toast.error("Failed to copy page Markdown");
    }
  }, [editor]);

  const getPageStats = useCallback(() => {
    return countWordsAndChars(extractBlocksPlainText(editor.document));
  }, [editor]);

  const renderSideMenu = useCallback(
    () => <MerakSideMenu onActiveBlockChange={setActiveHandleBlockId} />,
    [],
  );

  const sideMenuFloatingOptions = useMemo(
    () => ({
      useFloatingOptions: {
        middleware: [
          {
            name: "merakAlignSideMenu",
            fn({
              elements,
              rects,
            }: {
              elements: { reference?: unknown; floating?: unknown };
              rects: { reference: { height: number }; floating: { height: number } };
            }) {
              const refNode =
                elements.reference instanceof HTMLElement
                  ? elements.reference
                  : (elements.reference as { contextElement?: unknown } | undefined)?.contextElement;
              let targetHeight = 28;
              if (rects.reference.height <= 48) {
                targetHeight = Math.max(28, Math.round(rects.reference.height));
              } else if (refNode instanceof HTMLElement) {
                const heading = refNode.querySelector<HTMLElement>(
                  '.bn-block-content[data-content-type="heading"]',
                );
                if (heading) {
                  const level = heading.getAttribute("data-level");
                  targetHeight =
                    level === "2" ? 35 : level === "3" ? 30 : level === "4" ? 28 : 43;
                }
              }
              if (elements.floating instanceof HTMLElement) {
                elements.floating.style.setProperty(
                  "--merak-side-menu-height",
                  `${targetHeight}px`,
                );
              }
              return {};
            },
          },
        ],
      },
    }),
    [],
  );

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

  const handleBatchCopy = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const blocks = ids
        .map((id) => editor.getBlock(id))
        .filter((b): b is NonNullable<typeof b> => b !== undefined);
      if (blocks.length === 0) return;
      const markdown = serializeEditorToMerakMarkdown(editor, blocks);
      try {
        await navigator.clipboard.writeText(markdown);
        toast.success(`Copied ${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}`);
      } catch {
        toast.error("Unable to copy blocks to clipboard");
      }
    },
    [editor],
  );

  const handleBatchDuplicate = useCallback(
    (ids: string[]) => {
      if (readOnly || ids.length === 0) return;
      const blocks = ids
        .map((id) => editor.getBlock(id))
        .filter((b): b is NonNullable<typeof b> => b !== undefined);
      if (blocks.length === 0) return;
      const lastId = blocks[blocks.length - 1]?.id;
      if (!lastId) return;
      const clones = cloneBlocksForDuplicate(blocks) as MerakPartialBlock[];
      const inserted = editor.insertBlocks(clones, lastId, "after");
      selectionControlRef.current.setSelectedIds(inserted.map((b) => b.id));
    },
    [editor, readOnly],
  );

  const handleBatchDelete = useCallback(
    (ids: string[]) => {
      if (readOnly || ids.length === 0) return;
      const idSet = new Set(ids);
      const remainingTopLevel = editor.document.filter((b) => !idSet.has(b.id));
      if (remainingTopLevel.length === 0) {
        editor.replaceBlocks(ids, [{ type: "paragraph" }]);
      } else {
        editor.removeBlocks(ids);
      }
      selectionControlRef.current.clearSelection();
    },
    [editor, readOnly],
  );

  const handleBatchTurnInto = useCallback(
    (ids: string[], targetType: string, props?: Record<string, unknown>) => {
      if (readOnly || ids.length === 0) return;
      for (const id of ids) {
        const block = editor.getBlock(id);
        if (!block || NON_CONVERTIBLE_BLOCK_TYPES.has(block.type)) continue;
        editor.updateBlock(id, {
          type: targetType,
          ...(props ? { props } : {}),
        } as MerakPartialBlock);
      }
    },
    [editor, readOnly],
  );

  const marquee = useBlockMarqueeSelection({
    containerRef: editorScrollRef,
    getDocumentBlocks: () => editor.document,
    readOnly,
    nodeId: node.id,
    highlightedBlockId: activeHandleBlockId,
    onCopySelected: handleBatchCopy,
    onDuplicateSelected: handleBatchDuplicate,
    onDeleteSelected: handleBatchDelete,
  });

  selectionControlRef.current = {
    setSelectedIds: marquee.setSelectedIds,
    clearSelection: marquee.clearSelection,
  };

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
                  data-variant="ghost"
                  {...stylex.props(styles.toolbarAction)}
                  onClick={() => void createAndInsertChildBlock("doc", "Untitled Page")}
                >
                  <FilePlus2 size={14} />
                  <span>Subpage</span>
                </Button>
                <Button
                  data-variant="ghost"
                  {...stylex.props(styles.toolbarAction)}
                  onClick={() => setEmbedDialogOpen(true)}
                >
                  <Sparkles size={14} />
                  <span>Embed</span>
                </Button>
              </>
            ) : null}
            <DocAppearancePopover
              settings={docAppearance}
              onChange={handleAppearanceChange}
              onCopyPageMarkdown={handleCopyPageMarkdown}
              getPageStats={getPageStats}
            />
          </Inline>
        </Toolbar>

        <div
          ref={editorScrollRef}
          data-merak-editor="markdown"
          data-merak-theme={theme}
          data-merak-doc-font={docAppearance.fontStyle}
          data-merak-doc-small={docAppearance.smallText ? "true" : undefined}
          data-merak-doc-full={docAppearance.fullWidth ? "true" : undefined}
          data-marquee-dragging={marquee.isDragging ? "true" : undefined}
          onPointerDown={marquee.handlePointerDown}
          {...stylex.props(styles.editorScroll)}
        >
          <BlockNoteView
            editor={editor}
            theme={theme}
            editable={!readOnly}
            slashMenu={false}
            sideMenu={false}
            filePanel={false}
            onChange={handleEditorChange}
          >
            {!readOnly ? (
              <>
                <SideMenuController
                  sideMenu={renderSideMenu}
                  floatingUIOptions={sideMenuFloatingOptions}
                />
                <FilePanelController filePanel={MerakFilePanel} />
                <SuggestionMenuController
                  triggerCharacter="/"
                  getItems={getCustomSlashMenuItems}
                />
              </>
            ) : null}
          </BlockNoteView>

          {marquee.marqueeRect && marquee.marqueeRect.width > 0 && marquee.marqueeRect.height > 0 ? (
            <div
              data-slot="merak-marquee"
              aria-hidden="true"
              style={{
                left: marquee.marqueeRect.left,
                top: marquee.marqueeRect.top,
                width: marquee.marqueeRect.width,
                height: marquee.marqueeRect.height,
              }}
              {...stylex.props(styles.marqueeBox)}
            />
          ) : null}

          {marquee.selectedIds.length > 0 && !marquee.isDragging && marquee.anchorRect ? (
            <div
              data-slot="merak-batch-bar"
              role="toolbar"
              aria-label="Selected blocks actions"
              style={{
                left: marquee.anchorRect.left,
                top: marquee.anchorRect.top,
              }}
              {...stylex.props(styles.batchBar)}
            >
              <span {...stylex.props(styles.batchCount)}>
                {marquee.selectedIds.length}{" "}
                {marquee.selectedIds.length === 1 ? "block" : "blocks"}
              </span>

              {!readOnly ? (
                <>
                  <span {...stylex.props(styles.batchDivider)} />

                  <Menu>
                    <MenuTrigger
                      data-variant="ghost"
                      {...stylex.props(styles.batchActionButton)}
                    >
                      <span>Turn into</span>
                      <ChevronDown size={13} />
                    </MenuTrigger>
                    <MenuContent align="start" sideOffset={6} {...stylex.props(styles.batchMenuContent)}>
                      <MenuGroup>
                        <MenuGroupLabel>Turn selected into</MenuGroupLabel>
                        <MenuItem
                          value="turn:paragraph"
                          onSelect={() => handleBatchTurnInto(marquee.selectedIds, "paragraph")}
                        >
                          <MenuItemIcon>
                            <Type size={13} />
                          </MenuItemIcon>
                          <span>Text</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:h1"
                          onSelect={() =>
                            handleBatchTurnInto(marquee.selectedIds, "heading", { level: 1 })
                          }
                        >
                          <MenuItemIcon>
                            <Heading1 size={13} />
                          </MenuItemIcon>
                          <span>Heading 1</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:h2"
                          onSelect={() =>
                            handleBatchTurnInto(marquee.selectedIds, "heading", { level: 2 })
                          }
                        >
                          <MenuItemIcon>
                            <Heading2 size={13} />
                          </MenuItemIcon>
                          <span>Heading 2</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:h3"
                          onSelect={() =>
                            handleBatchTurnInto(marquee.selectedIds, "heading", { level: 3 })
                          }
                        >
                          <MenuItemIcon>
                            <Heading3 size={13} />
                          </MenuItemIcon>
                          <span>Heading 3</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:bullet"
                          onSelect={() => handleBatchTurnInto(marquee.selectedIds, "bulletListItem")}
                        >
                          <MenuItemIcon>
                            <List size={13} />
                          </MenuItemIcon>
                          <span>Bullet List</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:numbered"
                          onSelect={() =>
                            handleBatchTurnInto(marquee.selectedIds, "numberedListItem")
                          }
                        >
                          <MenuItemIcon>
                            <ListOrdered size={13} />
                          </MenuItemIcon>
                          <span>Numbered List</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:check"
                          onSelect={() => handleBatchTurnInto(marquee.selectedIds, "checkListItem")}
                        >
                          <MenuItemIcon>
                            <CheckSquare size={13} />
                          </MenuItemIcon>
                          <span>To-do List</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:quote"
                          onSelect={() => handleBatchTurnInto(marquee.selectedIds, "quote")}
                        >
                          <MenuItemIcon>
                            <Quote size={13} />
                          </MenuItemIcon>
                          <span>Quote</span>
                        </MenuItem>
                        <MenuItem
                          value="turn:code"
                          onSelect={() => handleBatchTurnInto(marquee.selectedIds, "codeBlock")}
                        >
                          <MenuItemIcon>
                            <Code2 size={13} />
                          </MenuItemIcon>
                          <span>Code Block</span>
                        </MenuItem>
                      </MenuGroup>
                    </MenuContent>
                  </Menu>

                  <Button
                    data-variant="ghost"
                    {...stylex.props(styles.batchActionButton)}
                    onClick={() => handleBatchDuplicate(marquee.selectedIds)}
                  >
                    <CopyPlus size={13} />
                    <span>Duplicate</span>
                  </Button>
                </>
              ) : null}

              <Button
                data-variant="ghost"
                {...stylex.props(styles.batchActionButton)}
                onClick={() => void handleBatchCopy(marquee.selectedIds)}
              >
                <Copy size={13} />
                <span>Copy</span>
              </Button>

              {!readOnly ? (
                <Button
                  data-variant="ghost"
                  {...stylex.props(styles.batchDeleteButton)}
                  onClick={() => handleBatchDelete(marquee.selectedIds)}
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </Button>
              ) : null}

              <Button
                data-variant="ghost"
                aria-label="Clear block selection"
                {...stylex.props(styles.batchCloseButton)}
                onClick={() => marquee.clearSelection()}
              >
                <X size={13} />
              </Button>
            </div>
          ) : null}
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

              <Stack gap="md">
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

              <div {...stylex.props(styles.dialogFooter)}>
                <DialogClose>Cancel</DialogClose>
                <Button
                  data-variant="solid"
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
