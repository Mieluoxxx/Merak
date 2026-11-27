import {
  type AssetEditorProps,
  extractCanvasText,
  extractExcalidrawText,
  type NodeDetailDto,
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
  Textarea,
} from "@merak/ui";
import { colors, font, radius, shadow, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  type NodeProps,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Blocks,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  Image as ImageIcon,
  Link2,
  Maximize2,
  Minimize2,
  Network,
  PenTool,
  StickyNote,
} from "lucide-react";
import {
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CanvasFloatingChrome, type CanvasInteractionMode } from "./CanvasFloatingChrome.js";
import {
  CanvasContextMenu,
  type CanvasContextTarget,
  CanvasMultiSelectBar,
  CanvasNodeActionPill,
} from "./CanvasOverlays.js";
import {
  CANVAS_LOD_ZOOM_THRESHOLD,
  type CanvasFileFlowData,
  type CanvasGroupFlowData,
  type CanvasLinkFlowData,
  type CanvasTextFlowData,
  canvasDocumentToFlow,
  flowToCanvasDocument,
  type MerakFlowEdge,
  type MerakFlowNode,
  parseCanvasContent,
  shouldActivateCanvasLod,
} from "./canvasHelpers.js";
import {
  type CanvasGridMode,
  type CanvasHistoryState,
  createCanvasHistory,
  createGroupForNodes,
  duplicateCanvasSelection,
  loadCanvasGridMode,
  pushCanvasHistory,
  redoCanvasHistory,
  resolveCanvasNodeColor,
  saveCanvasGridMode,
  undoCanvasHistory,
  ungroupNode,
} from "./canvasOps.js";
import "./editors.css";
import { countActiveExcalidrawElements, parseExcalidrawContent } from "./excalidrawHelpers.js";
import { extractDocExcerpt } from "./markdownHelpers.js";
import { formatMediaUrl, NODE_TYPE_META, useGlobalSaveShortcut } from "./shared.js";

interface CanvasEditorContextValue {
  readOnly: boolean;
  selectedNodeCount: number;
  activatedNodeId: string | null;
  setActivatedNodeId: (id: string | null) => void;
  updateNodeData: (nodeId: string, updater: (node: MerakFlowNode) => MerakFlowNode) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onUngroupNode: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  resolveNode?: (nodeId: string) => Promise<NodeDetailDto | null>;
}

const CanvasEditorContext = createContext<CanvasEditorContextValue>({
  readOnly: false,
  selectedNodeCount: 0,
  activatedNodeId: null,
  setActivatedNodeId: () => {},
  updateNodeData: () => {},
  onDuplicateNode: () => {},
  onDeleteNode: () => {},
  onUngroupNode: () => {},
  onOpenNode: () => {},
});

const styles = stylex.create({
  root: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: "480px",
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
    borderWidth: 0,
    borderRadius: 0,
    overflow: "hidden",
  },
  flowWrap: {
    flex: "1 1 auto",
    minHeight: 0,
    position: "relative",
    width: "100%",
    height: "100%",
  },
  emptyOverlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  hiddenInput: {
    display: "none",
  },
  textNode: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radius.md,
    boxShadow: shadow.sm,
    overflow: "hidden",
  },
  nodeSelected: {
    borderColor: colors.accent,
  },
  nodeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    paddingLeft: space.sm,
    paddingRight: space.sm,
    backgroundColor: colors.bgSubtle,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
    fontSize: font.sizeXs,
    fontWeight: 600,
    color: colors.textMuted,
  },
  textBody: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    paddingTop: space.xs,
    paddingBottom: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.xs,
  },
  textPreview: {
    width: "100%",
    height: "100%",
    overflowY: "auto",
    paddingTop: space.xs,
    paddingBottom: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.xs,
    fontFamily: font.sans,
    fontSize: font.sizeSm,
    lineHeight: 1.5,
    color: colors.text,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    userSelect: "none",
  },
  textPlaceholder: {
    color: colors.textSubtle,
  },
  textarea: {
    width: "100%",
    height: "100%",
    resize: "none",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.text,
    fontFamily: font.sans,
    fontSize: font.sizeSm,
    lineHeight: 1.5,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.xs,
    outlineStyle: "none",
  },
  groupNode: {
    width: "100%",
    height: "100%",
    borderRadius: radius.lg,
    borderWidth: "1.5px",
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.accentSubtle,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.sm,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  groupLabelInput: {
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingTop: space.xxs,
    paddingBottom: space.xxs,
    paddingLeft: space.sm,
    paddingRight: space.sm,
    fontSize: font.sizeXs,
    fontWeight: 600,
    color: colors.text,
  },
  linkNode: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radius.md,
    boxShadow: shadow.sm,
    overflow: "hidden",
  },
  linkBody: {
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.sm,
  },
  linkAnchor: {
    color: colors.accent,
    fontSize: font.sizeSm,
    fontWeight: 500,
    wordBreak: "break-all",
    textDecoration: "none",
  },
  fileNode: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radius.md,
    boxShadow: shadow.sm,
    overflow: "hidden",
  },
  fileBody: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    paddingTop: space.sm,
    paddingBottom: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.sm,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  fileTitle: {
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  fileSubtle: {
    fontSize: font.sizeXs,
    color: colors.textSubtle,
    marginTop: 0,
    marginBottom: 0,
  },
  filePreviewText: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: font.sizeXs,
    lineHeight: 1.5,
    color: colors.textMuted,
    whiteSpace: "pre-wrap",
  },
  mediaThumb: {
    width: "100%",
    height: "92px",
    objectFit: "cover",
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  mediaFull: {
    width: "100%",
    maxHeight: "220px",
    objectFit: "contain",
    borderRadius: radius.sm,
    backgroundColor: colors.bgSubtle,
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
    paddingTop: space.xl,
    paddingBottom: space.xl,
    paddingLeft: space.xl,
    paddingRight: space.xl,
    zIndex: 310,
  },
  dialogTitle: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: font.sizeLg,
    fontWeight: 600,
  },
  dialogDesc: {
    marginTop: 0,
    marginBottom: 0,
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

function isTextInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function FourSideHandles() {
  return (
    <>
      <Handle id="target-top" type="target" position={Position.Top} />
      <Handle id="source-top" type="source" position={Position.Top} />
      <Handle id="target-right" type="target" position={Position.Right} />
      <Handle id="source-right" type="source" position={Position.Right} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} />
      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="source-left" type="source" position={Position.Left} />
    </>
  );
}

function CanvasTextNodeComponent({ id, data, selected }: NodeProps<MerakFlowNode>) {
  const {
    readOnly,
    selectedNodeCount,
    updateNodeData,
    onDuplicateNode,
    onDeleteNode,
  } = useContext(CanvasEditorContext);
  const textData = data as CanvasTextFlowData;
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!selected) {
      setIsEditing(false);
    }
  }, [selected]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const colorTheme = resolveCanvasNodeColor(textData.color);
  const showToolbar = Boolean(selected && selectedNodeCount === 1 && !readOnly);

  return (
    <div
      style={colorTheme ? { borderColor: colorTheme.border } : undefined}
      onDoubleClick={(event) => {
        if (readOnly) return;
        event.stopPropagation();
        setIsEditing(true);
      }}
      {...stylex.props(styles.textNode, selected && styles.nodeSelected)}
    >
      <CanvasNodeActionPill
        isVisible={showToolbar}
        currentColor={textData.color}
        isGroup={false}
        onSelectColor={(color) => {
          updateNodeData(id, (node) => ({
            ...node,
            data: { ...(node.data as CanvasTextFlowData), color },
          }));
        }}
        onDuplicate={() => onDuplicateNode(id)}
        onDelete={() => onDeleteNode(id)}
      />
      <NodeResizer isVisible={Boolean(selected && !readOnly)} minWidth={180} minHeight={100} />
      <FourSideHandles />
      <div
        style={colorTheme ? { backgroundColor: colorTheme.tint } : undefined}
        {...stylex.props(styles.nodeHeader)}
      >
        <Inline gap="xs">
          <StickyNote size={13} />
          <span>Note</span>
        </Inline>
      </div>
      <div
        className={isEditing ? "nodrag nopan" : undefined}
        {...stylex.props(styles.textBody)}
      >
        {isEditing && !readOnly ? (
          <Textarea
            ref={textareaRef}
            value={textData.text}
            placeholder="Write a note..."
            onBlur={() => setIsEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setIsEditing(false);
              }
            }}
            onValueChange={(nextText) => {
              updateNodeData(id, (node) => ({
                ...node,
                data: {
                  ...(node.data as CanvasTextFlowData),
                  text: nextText,
                },
              }));
            }}
            {...stylex.props(styles.textarea)}
          />
        ) : (
          <div
            {...stylex.props(
              styles.textPreview,
              textData.text.trim().length === 0 && styles.textPlaceholder,
            )}
          >
            {textData.text.trim().length > 0 ? textData.text : "Double-click to edit text"}
          </div>
        )}
      </div>
    </div>
  );
}

function CanvasGroupNodeComponent({ id, data, selected }: NodeProps<MerakFlowNode>) {
  const {
    readOnly,
    selectedNodeCount,
    updateNodeData,
    onUngroupNode,
    onDuplicateNode,
    onDeleteNode,
  } = useContext(CanvasEditorContext);
  const groupData = data as CanvasGroupFlowData;
  const colorTheme = resolveCanvasNodeColor(groupData.color);
  const showToolbar = Boolean(selected && selectedNodeCount === 1 && !readOnly);

  return (
    <div
      style={
        colorTheme
          ? { borderColor: colorTheme.border, backgroundColor: colorTheme.tint }
          : undefined
      }
      {...stylex.props(styles.groupNode, selected && styles.nodeSelected)}
    >
      <CanvasNodeActionPill
        isVisible={showToolbar}
        currentColor={groupData.color}
        isGroup
        onSelectColor={(color) => {
          updateNodeData(id, (node) => ({
            ...node,
            data: { ...(node.data as CanvasGroupFlowData), color },
          }));
        }}
        onUngroup={() => onUngroupNode(id)}
        onDuplicate={() => onDuplicateNode(id)}
        onDelete={() => onDeleteNode(id)}
      />
      <NodeResizer isVisible={Boolean(selected && !readOnly)} minWidth={240} minHeight={160} />
      <FourSideHandles />
      <div className="nodrag nopan">
        <Input
          value={groupData.label ?? ""}
          readOnly={readOnly}
          placeholder="Group label"
          onValueChange={(nextLabel) => {
            updateNodeData(id, (node) => ({
              ...node,
              data: {
                ...(node.data as CanvasGroupFlowData),
                label: nextLabel,
              },
            }));
          }}
          {...stylex.props(styles.groupLabelInput)}
        />
      </div>
    </div>
  );
}

function CanvasLinkNodeComponent({ id, data, selected }: NodeProps<MerakFlowNode>) {
  const {
    readOnly,
    selectedNodeCount,
    updateNodeData,
    onDuplicateNode,
    onDeleteNode,
  } = useContext(CanvasEditorContext);
  const linkData = data as CanvasLinkFlowData;
  const colorTheme = resolveCanvasNodeColor(linkData.color);
  const showToolbar = Boolean(selected && selectedNodeCount === 1 && !readOnly);

  let hostname = linkData.url;
  try {
    hostname = new URL(linkData.url).hostname;
  } catch {
    // Keep raw URL when not parseable.
  }

  return (
    <div
      style={colorTheme ? { borderColor: colorTheme.border } : undefined}
      {...stylex.props(styles.linkNode, selected && styles.nodeSelected)}
    >
      <CanvasNodeActionPill
        isVisible={showToolbar}
        currentColor={linkData.color}
        isGroup={false}
        onSelectColor={(color) => {
          updateNodeData(id, (node) => ({
            ...node,
            data: { ...(node.data as CanvasLinkFlowData), color },
          }));
        }}
        onDuplicate={() => onDuplicateNode(id)}
        onDelete={() => onDeleteNode(id)}
      />
      <NodeResizer isVisible={Boolean(selected && !readOnly)} minWidth={200} minHeight={110} />
      <FourSideHandles />
      <div
        style={colorTheme ? { backgroundColor: colorTheme.tint } : undefined}
        {...stylex.props(styles.nodeHeader)}
      >
        <Inline gap="xs">
          <Link2 size={13} />
          <span>Link</span>
        </Inline>
        <Badge tone="neutral">{hostname}</Badge>
      </div>
      <div className="nodrag nopan" {...stylex.props(styles.linkBody)}>
        <a
          href={linkData.url}
          target="_blank"
          rel="noopener noreferrer"
          {...stylex.props(styles.linkAnchor)}
        >
          {linkData.url}
        </a>
        {selected && !readOnly ? (
          <Input
            value={linkData.url}
            onValueChange={(nextUrl) => {
              if (!nextUrl.trim()) return;
              updateNodeData(id, (node) => ({
                ...node,
                data: {
                  ...(node.data as CanvasLinkFlowData),
                  url: nextUrl,
                },
              }));
            }}
            placeholder="https://example.com"
          />
        ) : null}
      </div>
    </div>
  );
}

function CanvasFileNodeComponent({ id, data, selected }: NodeProps<MerakFlowNode>) {
  const {
    readOnly,
    selectedNodeCount,
    activatedNodeId,
    setActivatedNodeId,
    updateNodeData,
    onDuplicateNode,
    onDeleteNode,
    onOpenNode,
    resolveNode,
  } = useContext(CanvasEditorContext);
  const { zoom } = useViewport();
  const fileData = data as CanvasFileFlowData;

  const isActivated = activatedNodeId === id;
  const isLodActive = shouldActivateCanvasLod(zoom, isActivated);

  const [resolved, setResolved] = useState<NodeDetailDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLodActive || !fileData.nodeId || !resolveNode) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolveNode(fileData.nodeId)
      .then((detail) => {
        if (!cancelled) setResolved(detail);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLodActive, fileData.nodeId, resolveNode]);

  const mediaUrl = fileData.mediaId
    ? `/api/media/${fileData.mediaId}`
    : fileData.file.startsWith("/api/media/")
      ? fileData.file
      : null;

  const kindLabel = fileData.nodeId
    ? resolved
      ? NODE_TYPE_META[resolved.type].shortLabel
      : "Node"
    : mediaUrl
      ? "Media"
      : "File";

  const renderIcon = () => {
    if (resolved?.type === "folder") return <Folder size={14} />;
    if (resolved?.type === "excalidraw") return <PenTool size={14} />;
    if (resolved?.type === "html") return <Blocks size={14} />;
    if (resolved?.type === "canvas") return <Network size={14} />;
    if (mediaUrl) return <ImageIcon size={14} />;
    if (fileData.nodeId) return <FileText size={14} />;
    return <FileCode2 size={14} />;
  };

  const renderRichPreview = () => {
    if (mediaUrl) {
      return (
        <Stack gap="xs">
          <img src={mediaUrl} alt={fileData.file} {...stylex.props(styles.mediaFull)} />
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(styles.linkAnchor)}
          >
            Open full media
          </a>
        </Stack>
      );
    }

    if (fileData.nodeId) {
      if (loading) {
        return <p {...stylex.props(styles.fileSubtle)}>Loading node preview…</p>;
      }
      if (!resolved) {
        return (
          <Stack gap="xs">
            <p {...stylex.props(styles.fileSubtle)}>
              Node reference: <code>{fileData.nodeId}</code>
            </p>
            <Button onClick={() => onOpenNode(fileData.nodeId!)}>
              <ExternalLink size={13} />
              Open Node
            </Button>
          </Stack>
        );
      }

      let snippet = "";
      if (resolved.type === "folder") {
        snippet = "Workspace folder — open to browse nested subfolders and assets.";
      } else if (resolved.type === "doc") {
        snippet = extractDocExcerpt(resolved.content, 180);
      } else if (resolved.type === "excalidraw") {
        const count = countActiveExcalidrawElements(parseExcalidrawContent(resolved.content));
        const text = extractExcalidrawText(resolved.content);
        snippet = `${count} elements${text ? ` · ${text.slice(0, 120)}` : ""}`;
      } else if (resolved.type === "html") {
        snippet = `HTML Artifact (${resolved.content.length} chars) — sandboxed preview available on open.`;
      } else if (resolved.type === "canvas") {
        const sub = parseCanvasContent(resolved.content);
        const text = extractCanvasText(resolved.content);
        snippet = `${sub.nodes.length} nodes, ${sub.edges.length} edges${text ? ` · ${text.slice(0, 100)}` : ""}`;
      }

      return (
        <Stack gap="xs">
          <p {...stylex.props(styles.filePreviewText)}>{snippet}</p>
          <Inline gap="xs">
            <Button onClick={() => onOpenNode(resolved.id)}>
              <ExternalLink size={13} />
              Open Node
            </Button>
          </Inline>
        </Stack>
      );
    }

    return (
      <Stack gap="xs">
        <p {...stylex.props(styles.filePreviewText)}>{fileData.file}</p>
        {fileData.subpath ? (
          <p {...stylex.props(styles.fileSubtle)}>Subpath: {fileData.subpath}</p>
        ) : null}
      </Stack>
    );
  };

  const colorTheme = resolveCanvasNodeColor(fileData.color);
  const showToolbar = Boolean(selected && selectedNodeCount === 1 && !readOnly);

  return (
    <div
      style={colorTheme ? { borderColor: colorTheme.border } : undefined}
      onClick={() => {
        if (zoom >= CANVAS_LOD_ZOOM_THRESHOLD) {
          setActivatedNodeId(id);
        }
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setActivatedNodeId(isActivated ? null : id);
      }}
      {...stylex.props(styles.fileNode, selected && styles.nodeSelected)}
    >
      <CanvasNodeActionPill
        isVisible={showToolbar}
        currentColor={fileData.color}
        isGroup={false}
        onSelectColor={(color) => {
          updateNodeData(id, (node) => ({
            ...node,
            data: { ...(node.data as CanvasFileFlowData), color },
          }));
        }}
        onDuplicate={() => onDuplicateNode(id)}
        onDelete={() => onDeleteNode(id)}
      />
      <NodeResizer isVisible={Boolean(selected && !readOnly)} minWidth={220} minHeight={120} />
      <FourSideHandles />
      <div
        style={colorTheme ? { backgroundColor: colorTheme.tint } : undefined}
        {...stylex.props(styles.nodeHeader)}
      >
        <Inline gap="xs">
          {renderIcon()}
          <Badge tone={isLodActive ? "accent" : "neutral"}>{kindLabel}</Badge>
        </Inline>
        <Button
          aria-label={isLodActive ? "Collapse card preview" : "Expand card preview"}
          onClick={(event) => {
            event.stopPropagation();
            setActivatedNodeId(isActivated ? null : id);
          }}
        >
          {isLodActive ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </Button>
      </div>

      <div className="nodrag nopan" {...stylex.props(styles.fileBody)}>
        <div {...stylex.props(styles.fileTitle)}>
          {resolved?.title ?? fileData.file}
        </div>

        {isLodActive ? (
          renderRichPreview()
        ) : (
          <>
            {mediaUrl ? (
              <img src={mediaUrl} alt={fileData.file} {...stylex.props(styles.mediaThumb)} />
            ) : null}
            <p {...stylex.props(styles.fileSubtle)}>
              {zoom < CANVAS_LOD_ZOOM_THRESHOLD
                ? `Zoom in (≥ ${Math.round(CANVAS_LOD_ZOOM_THRESHOLD * 100)}%) for live preview`
                : "Click or double-click to activate preview"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const CANVAS_NODE_TYPES: NodeTypes = {
  canvasText: CanvasTextNodeComponent,
  canvasGroup: CanvasGroupNodeComponent,
  canvasLink: CanvasLinkNodeComponent,
  canvasFile: CanvasFileNodeComponent,
};

function makeNodeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function CanvasEditorInner({
  node,
  readOnly = false,
  theme,
  onChange,
  onSave,
  onUploadMedia,
  onOpenNode,
  resolveNode,
}: AssetEditorProps) {
  const { fitView, zoomTo, screenToFlowPosition } = useReactFlow<MerakFlowNode, MerakFlowEdge>();
  const { zoom } = useViewport();

  const initialFlow = useMemo(
    () => canvasDocumentToFlow(parseCanvasContent(node.content)),
    [node.id],
  );
  const initialSerialized = useMemo(
    () => JSON.stringify(flowToCanvasDocument(initialFlow.nodes, initialFlow.edges), null, 2),
    [initialFlow],
  );

  const [nodes, setNodes] = useState<MerakFlowNode[]>(initialFlow.nodes);
  const [edges, setEdges] = useState<MerakFlowEdge[]>(initialFlow.edges);
  const [activatedNodeId, setActivatedNodeId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [interactionMode, setInteractionMode] = useState<CanvasInteractionMode>("select");
  const [spacePanning, setSpacePanning] = useState(false);
  const [gridMode, setGridMode] = useState<CanvasGridMode>(() => loadCanvasGridMode());
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<CanvasContextTarget | null>(null);

  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [embedNodeId, setEmbedNodeId] = useState("");
  const [embedLabel, setEmbedLabel] = useState("");

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  const sectionRef = useRef<HTMLElement | null>(null);
  const flowWrapRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isPointerInsideRef = useRef(false);
  const isNodeDraggingRef = useRef(false);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const lastSerializedRef = useRef<string>(initialSerialized);
  const lastNodeIdRef = useRef(node.id);
  const historyRef = useRef<CanvasHistoryState>(createCanvasHistory(initialSerialized));
  const [historyMeta, setHistoryMeta] = useState(() => ({
    canUndo: false,
    canRedo: false,
  }));

  const syncHistoryMeta = useCallback((state: CanvasHistoryState) => {
    setHistoryMeta({
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    });
  }, []);

  // Re-hydrate when switching to a different canvas node.
  useEffect(() => {
    if (lastNodeIdRef.current !== node.id) {
      lastNodeIdRef.current = node.id;
      const parsed = parseCanvasContent(node.content);
      const nextFlow = canvasDocumentToFlow(parsed);
      const serialized = JSON.stringify(parsed, null, 2);
      setNodes(nextFlow.nodes);
      setEdges(nextFlow.edges);
      setActivatedNodeId(null);
      setContextMenu(null);
      nodesRef.current = nextFlow.nodes;
      edgesRef.current = nextFlow.edges;
      lastSerializedRef.current = serialized;
      historyRef.current = createCanvasHistory(serialized);
      syncHistoryMeta(historyRef.current);
    }
  }, [node.id, node.content, syncHistoryMeta]);

  const emitCanvasIfChanged = useCallback(
    (
      nextNodes: readonly MerakFlowNode[],
      nextEdges: readonly MerakFlowEdge[],
      recordHistory = true,
    ) => {
      if (readOnly) return;
      const serialized = JSON.stringify(flowToCanvasDocument(nextNodes, nextEdges), null, 2);
      if (serialized !== lastSerializedRef.current) {
        lastSerializedRef.current = serialized;
        onChangeRef.current(serialized);
        if (recordHistory) {
          historyRef.current = pushCanvasHistory(historyRef.current, serialized);
          syncHistoryMeta(historyRef.current);
        }
      }
    },
    [readOnly, syncHistoryMeta],
  );

  const commitCanvasState = useCallback(
    (
      nextNodes: MerakFlowNode[],
      nextEdges: MerakFlowEdge[],
      recordHistory = true,
    ) => {
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      emitCanvasIfChanged(nextNodes, nextEdges, recordHistory);
    },
    [emitCanvasIfChanged],
  );

  const applyHistorySnapshot = useCallback(
    (snapshot: string) => {
      const parsed = parseCanvasContent(snapshot);
      const nextFlow = canvasDocumentToFlow(parsed);
      nodesRef.current = nextFlow.nodes;
      edgesRef.current = nextFlow.edges;
      setNodes(nextFlow.nodes);
      setEdges(nextFlow.edges);
      setActivatedNodeId(null);
      lastSerializedRef.current = snapshot;
      if (!readOnly) {
        onChangeRef.current(snapshot);
      }
    },
    [readOnly],
  );

  const handleUndo = useCallback(() => {
    if (readOnly || historyRef.current.past.length === 0) return;
    historyRef.current = undoCanvasHistory(historyRef.current);
    syncHistoryMeta(historyRef.current);
    applyHistorySnapshot(historyRef.current.present);
  }, [applyHistorySnapshot, readOnly, syncHistoryMeta]);

  const handleRedo = useCallback(() => {
    if (readOnly || historyRef.current.future.length === 0) return;
    historyRef.current = redoCanvasHistory(historyRef.current);
    syncHistoryMeta(historyRef.current);
    applyHistorySnapshot(historyRef.current.present);
  }, [applyHistorySnapshot, readOnly, syncHistoryMeta]);

  const handleNodesChange: OnNodesChange<MerakFlowNode> = useCallback(
    (changes) => {
      const nextNodes = changes.applyTo(nodesRef.current);
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      emitCanvasIfChanged(nextNodes, edgesRef.current, !isNodeDraggingRef.current);
    },
    [emitCanvasIfChanged],
  );

  const handleNodeDragStart = useCallback(() => {
    isNodeDraggingRef.current = true;
  }, []);

  const handleNodeDragStop = useCallback(() => {
    if (!isNodeDraggingRef.current || readOnly) return;
    isNodeDraggingRef.current = false;
    const serialized = JSON.stringify(
      flowToCanvasDocument(nodesRef.current, edgesRef.current),
      null,
      2,
    );
    lastSerializedRef.current = serialized;
    historyRef.current = pushCanvasHistory(historyRef.current, serialized);
    syncHistoryMeta(historyRef.current);
  }, [readOnly, syncHistoryMeta]);

  const handleEdgesChange: OnEdgesChange<MerakFlowEdge> = useCallback(
    (changes) => {
      const nextEdges = changes.applyTo(edgesRef.current);
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
      emitCanvasIfChanged(nodesRef.current, nextEdges);
    },
    [emitCanvasIfChanged],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;
      const nextEdges = addEdge<MerakFlowEdge>(
        {
          ...connection,
          id: makeNodeId("edge"),
          markerEnd: { type: MarkerType.ArrowClosed },
          data: { toEnd: "arrow", fromEnd: "none" },
        },
        edgesRef.current,
      );
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
      emitCanvasIfChanged(nodesRef.current, nextEdges);
    },
    [emitCanvasIfChanged, readOnly],
  );

  const updateNodeData = useCallback(
    (targetId: string, updater: (node: MerakFlowNode) => MerakFlowNode) => {
      const nextNodes = nodesRef.current.map((item) =>
        item.id === targetId ? updater(item) : item,
      );
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      emitCanvasIfChanged(nextNodes, edgesRef.current);
    },
    [emitCanvasIfChanged],
  );

  const appendNode = useCallback(
    (nextNode: MerakFlowNode) => {
      const selectedCleared = nodesRef.current.map((n) =>
        n.selected ? { ...n, selected: false } : n,
      );
      const nextNodes =
        nextNode.type === "canvasGroup"
          ? [{ ...nextNode, selected: true }, ...selectedCleared]
          : [...selectedCleared, { ...nextNode, selected: true }];
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      emitCanvasIfChanged(nextNodes, edgesRef.current);
    },
    [emitCanvasIfChanged],
  );

  const nextSpawnPosition = useCallback(
    (width = 280, height = 160): { x: number; y: number } => {
      const cascade = (nodesRef.current.length % 6) * 24;
      const rect = flowWrapRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const center = screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        return {
          x: Math.round(center.x - width / 2 + cascade),
          y: Math.round(center.y - height / 2 + cascade),
        };
      }
      return { x: 100 + cascade, y: 100 + cascade };
    },
    [screenToFlowPosition],
  );

  const handleAddTextNoteAt = useCallback(
    (x?: number, y?: number, initialText = "New note") => {
      const pos = x !== undefined && y !== undefined ? { x: Math.round(x), y: Math.round(y) } : nextSpawnPosition(280, 160);
      appendNode({
        id: makeNodeId("text"),
        type: "canvasText",
        position: pos,
        width: 280,
        height: 160,
        style: { width: 280, height: 160 },
        data: {
          canvasType: "text",
          text: initialText,
        },
      });
    },
    [appendNode, nextSpawnPosition],
  );

  const handleAddGroupAt = useCallback(
    (x?: number, y?: number) => {
      const pos = x !== undefined && y !== undefined ? { x: Math.round(x), y: Math.round(y) } : nextSpawnPosition(440, 300);
      appendNode({
        id: makeNodeId("group"),
        type: "canvasGroup",
        zIndex: -1,
        position: pos,
        width: 440,
        height: 300,
        style: { width: 440, height: 300 },
        data: {
          canvasType: "group",
          label: "Group",
        },
      });
    },
    [appendNode, nextSpawnPosition],
  );

  const handleAddLinkCard = useCallback(
    (url: string, x?: number, y?: number) => {
      const pos = x !== undefined && y !== undefined ? { x: Math.round(x), y: Math.round(y) } : nextSpawnPosition(280, 130);
      appendNode({
        id: makeNodeId("link"),
        type: "canvasLink",
        position: pos,
        width: 280,
        height: 130,
        style: { width: 280, height: 130 },
        data: {
          canvasType: "link",
          url,
        },
      });
    },
    [appendNode, nextSpawnPosition],
  );

  const handleConfirmEmbedNode = () => {
    const trimmedId = embedNodeId.trim();
    if (!trimmedId) return;
    appendNode({
      id: makeNodeId("file"),
      type: "canvasFile",
      position: nextSpawnPosition(300, 190),
      width: 300,
      height: 190,
      style: { width: 300, height: 190 },
      data: {
        canvasType: "file",
        file: embedLabel.trim() || `node:${trimmedId}`,
        nodeId: trimmedId,
      },
    });
    setEmbedNodeId("");
    setEmbedLabel("");
    setEmbedDialogOpen(false);
  };

  const handleConfirmAddLink = () => {
    const trimmed = linkUrl.trim();
    try {
      const parsed = new URL(trimmed);
      handleAddLinkCard(parsed.toString());
      setLinkUrl("https://");
      setLinkDialogOpen(false);
    } catch {
      // Ignore invalid URL until user enters a valid http(s) URL.
    }
  };

  const uploadAndAppendImage = useCallback(
    async (file: File, pos?: { x: number; y: number }) => {
      if (readOnly) return;
      setUploading(true);
      try {
        const media = await onUploadMedia(file);
        const mediaUrl = formatMediaUrl(media);
        appendNode({
          id: makeNodeId("media"),
          type: "canvasFile",
          position: pos ?? nextSpawnPosition(300, 220),
          width: 300,
          height: 220,
          style: { width: 300, height: 220 },
          data: {
            canvasType: "file",
            file: mediaUrl,
            mediaId: media.id,
          },
        });
      } finally {
        setUploading(false);
      }
    },
    [appendNode, nextSpawnPosition, onUploadMedia, readOnly],
  );

  const handleUploadImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || readOnly) return;
    await uploadAndAppendImage(file);
  };

  const selectedIds = useMemo(
    () => nodes.filter((item) => item.selected).map((item) => item.id),
    [nodes],
  );

  const handleDuplicateIds = useCallback(
    (ids: readonly string[]) => {
      if (readOnly || ids.length === 0) return;
      const duplicated = duplicateCanvasSelection(nodesRef.current, edgesRef.current, ids, makeNodeId);
      commitCanvasState(duplicated.nodes, duplicated.edges);
    },
    [commitCanvasState, readOnly],
  );

  const handleDeleteIds = useCallback(
    (ids: readonly string[]) => {
      if (readOnly) return;
      const idSet = new Set(ids);
      const nextNodes = nodesRef.current.filter((item) => !idSet.has(item.id));
      const nextEdges = edgesRef.current.filter(
        (edge) => !edge.selected && !idSet.has(edge.source) && !idSet.has(edge.target),
      );
      if (nextNodes.length !== nodesRef.current.length || nextEdges.length !== edgesRef.current.length) {
        commitCanvasState(nextNodes, nextEdges);
      }
    },
    [commitCanvasState, readOnly],
  );

  const handleGroupSelected = useCallback(() => {
    if (readOnly) return;
    const currentSelected = nodesRef.current.filter((n) => n.selected && n.type !== "canvasGroup");
    if (currentSelected.length < 2) return;
    const nextNodes = createGroupForNodes(
      nodesRef.current,
      currentSelected.map((n) => n.id),
      makeNodeId("group"),
    );
    commitCanvasState(nextNodes, edgesRef.current);
  }, [commitCanvasState, readOnly]);

  const handleUngroupNode = useCallback(
    (groupId: string) => {
      if (readOnly) return;
      const nextNodes = ungroupNode(nodesRef.current, groupId);
      if (nextNodes.length !== nodesRef.current.length) {
        commitCanvasState(nextNodes, edgesRef.current);
      }
    },
    [commitCanvasState, readOnly],
  );

  const handleClearCanvas = useCallback(() => {
    if (readOnly || (nodesRef.current.length === 0 && edgesRef.current.length === 0)) return;
    setActivatedNodeId(null);
    setContextMenu(null);
    commitCanvasState([], []);
  }, [commitCanvasState, readOnly]);

  const handleGridModeChange = useCallback((mode: CanvasGridMode) => {
    setGridMode(mode);
    saveCanvasGridMode(mode);
  }, []);

  const handleFitView = useCallback(() => {
    void fitView({ padding: 0.2, duration: 240 });
  }, [fitView]);

  const handleZoomChange = useCallback(
    (nextZoom: number) => {
      void zoomTo(Math.min(2.5, Math.max(0.15, nextZoom)), { duration: 120 });
    },
    [zoomTo],
  );

  const handleSave = useCallback(async () => {
    if (!onSaveRef.current || readOnly) return;
    const serialized = JSON.stringify(
      flowToCanvasDocument(nodesRef.current, edgesRef.current),
      null,
      2,
    );
    lastSerializedRef.current = serialized;
    await onSaveRef.current(serialized);
  }, [readOnly]);

  useGlobalSaveShortcut(Boolean(onSave) && !readOnly, handleSave);

  // Space temporary pan + canvas keyboard shortcuts.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputElement(event.target)) return;
      const activeInside =
        sectionRef.current?.contains(document.activeElement) || isPointerInsideRef.current;
      if (!activeInside) return;

      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        setSpacePanning(true);
        return;
      }

      if (event.key === "Escape") {
        setContextMenu(null);
        setShortcutsOpen(false);
        setActivatedNodeId(null);
        const cleared = nodesRef.current.map((n) => (n.selected ? { ...n, selected: false } : n));
        nodesRef.current = cleared;
        setNodes(cleared);
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (!mod && !event.altKey) {
        if (key === "v") {
          setInteractionMode("select");
          return;
        }
        if (key === "h") {
          setInteractionMode("pan");
          return;
        }
        if ((event.key === "Delete" || event.key === "Backspace") && !readOnly) {
          const curSelectedIds = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
          const hasSelectedEdges = edgesRef.current.some((e) => e.selected);
          if (curSelectedIds.length > 0 || hasSelectedEdges) {
            event.preventDefault();
            handleDeleteIds(curSelectedIds);
          }
          return;
        }
      }

      if (!mod || readOnly) return;

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        handleRedo();
      } else if (key === "a") {
        event.preventDefault();
        const allSelected = nodesRef.current.map((n) => ({ ...n, selected: true }));
        nodesRef.current = allSelected;
        setNodes(allSelected);
      } else if (key === "d") {
        const curSelectedIds = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
        if (curSelectedIds.length > 0) {
          event.preventDefault();
          handleDuplicateIds(curSelectedIds);
        }
      } else if (key === "g" && !event.shiftKey) {
        event.preventDefault();
        handleGroupSelected();
      } else if (key === "g" && event.shiftKey) {
        const selectedGroup = nodesRef.current.find(
          (n) => n.selected && n.type === "canvasGroup",
        );
        if (selectedGroup) {
          event.preventDefault();
          handleUngroupNode(selectedGroup.id);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePanning(false);
      }
    };

    const handleWindowBlur = () => {
      setSpacePanning(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    handleDeleteIds,
    handleDuplicateIds,
    handleGroupSelected,
    handleRedo,
    handleUndo,
    handleUngroupNode,
    readOnly,
  ]);

  const handlePaste = useCallback(
    (event: ReactClipboardEvent<HTMLElement>) => {
      if (readOnly || isTextInputElement(event.target)) return;
      const items = event.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              void uploadAndAppendImage(file);
              return;
            }
          }
        }
      }

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;
      event.preventDefault();
      try {
        const parsed = new URL(text);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          handleAddLinkCard(parsed.toString());
          return;
        }
      } catch {
        // Fallback to plain note card.
      }
      handleAddTextNoteAt(undefined, undefined, text);
    },
    [handleAddLinkCard, handleAddTextNoteAt, readOnly, uploadAndAppendImage],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const files = Array.from(event.dataTransfer.files);
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (!imageFile) return;
      event.preventDefault();
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      void uploadAndAppendImage(imageFile, {
        x: Math.round(flowPos.x - 150),
        y: Math.round(flowPos.y - 110),
      });
    },
    [readOnly, screenToFlowPosition, uploadAndAppendImage],
  );

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      if (readOnly) return;
      event.preventDefault();
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        kind: "pane",
        screenX: event.clientX,
        screenY: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
    },
    [readOnly, screenToFlowPosition],
  );

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent, targetNode: MerakFlowNode) => {
      if (readOnly) return;
      event.preventDefault();
      setContextMenu({
        kind: "node",
        screenX: event.clientX,
        screenY: event.clientY,
        nodeId: targetNode.id,
        isGroup: targetNode.type === "canvasGroup",
      });
    },
    [readOnly],
  );

  const handleDuplicateSingle = useCallback(
    (targetId: string) => {
      handleDuplicateIds([targetId]);
    },
    [handleDuplicateIds],
  );

  const handleDeleteSingle = useCallback(
    (targetId: string) => {
      handleDeleteIds([targetId]);
    },
    [handleDeleteIds],
  );

  const contextValue = useMemo<CanvasEditorContextValue>(
    () => ({
      readOnly,
      selectedNodeCount: selectedIds.length,
      activatedNodeId,
      setActivatedNodeId,
      updateNodeData,
      onDuplicateNode: handleDuplicateSingle,
      onDeleteNode: handleDeleteSingle,
      onUngroupNode: handleUngroupNode,
      onOpenNode,
      resolveNode,
    }),
    [
      readOnly,
      selectedIds.length,
      activatedNodeId,
      updateNodeData,
      handleDuplicateSingle,
      handleDeleteSingle,
      handleUngroupNode,
      onOpenNode,
      resolveNode,
    ],
  );

  const isLinkValid = useMemo(() => {
    try {
      new URL(linkUrl.trim());
      return true;
    } catch {
      return false;
    }
  }, [linkUrl]);

  const effectivePan = spacePanning || interactionMode === "pan";

  return (
    <CanvasEditorContext.Provider value={contextValue}>
      <section
        ref={sectionRef}
        tabIndex={-1}
        aria-label={`Infinite Canvas Editor: ${node.title}`}
        onMouseEnter={() => {
          isPointerInsideRef.current = true;
        }}
        onMouseLeave={() => {
          isPointerInsideRef.current = false;
        }}
        onPaste={handlePaste}
        {...stylex.props(styles.root)}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadImageChange}
          {...stylex.props(styles.hiddenInput)}
        />

        <div
          ref={flowWrapRef}
          data-merak-editor="canvas"
          data-merak-theme={theme}
          data-merak-canvas-mode={effectivePan ? "pan" : "select"}
          onDragOver={(event) => {
            if (!readOnly && event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
            }
          }}
          onDrop={handleDrop}
          {...stylex.props(styles.flowWrap)}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={CANVAS_NODE_TYPES}
            forceColorMode={theme}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            panOnDrag={effectivePan ? true : [1, 2]}
            selectionOnDrag={!effectivePan}
            selectionMode={SelectionMode.Partial}
            minZoom={0.15}
            maxZoom={2.5}
            onNodesChange={handleNodesChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onPaneClick={() => {
              setActivatedNodeId(null);
              setContextMenu(null);
            }}
            onPaneContextMenu={handlePaneContextMenu}
            onNodeContextMenu={handleNodeContextMenu}
            fitView={nodes.length > 0}
          >
            {gridMode !== "blank" ? (
              <Background
                variant={gridMode === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Dots}
                gap={gridMode === "lines" ? 28 : 22}
                size={gridMode === "lines" ? 1 : 1.5}
                color={
                  theme === "dark"
                    ? gridMode === "lines"
                      ? "rgba(245, 245, 244, 0.07)"
                      : "rgba(245, 245, 244, 0.18)"
                    : gridMode === "lines"
                      ? "rgba(68, 64, 60, 0.08)"
                      : "rgba(68, 64, 60, 0.22)"
                }
              />
            ) : null}
            {minimapOpen ? (
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                nodeColor={theme === "dark" ? "#3a3631" : "#d6d3ca"}
                maskColor={
                  theme === "dark" ? "rgba(24, 23, 21, 0.7)" : "rgba(244, 242, 237, 0.7)"
                }
              />
            ) : null}
          </ReactFlow>

          {nodes.length === 0 ? (
            <div {...stylex.props(styles.emptyOverlay)}>
              <EmptyState
                icon={<Network size={28} />}
                title="Empty Infinite Canvas"
                description="Use the floating dock below or right-click anywhere to add notes, groups, links, or images."
              />
            </div>
          ) : null}

          <CanvasMultiSelectBar
            selectedCount={selectedIds.length}
            readOnly={readOnly}
            onGroupSelected={handleGroupSelected}
            onDuplicateSelected={() => handleDuplicateIds(selectedIds)}
            onDeleteSelected={() => handleDeleteIds(selectedIds)}
          />

          <CanvasFloatingChrome
            readOnly={readOnly}
            interactionMode={interactionMode}
            spacePanning={spacePanning}
            onInteractionModeChange={setInteractionMode}
            canUndo={historyMeta.canUndo}
            canRedo={historyMeta.canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onFitView={handleFitView}
            onAddTextNote={() => handleAddTextNoteAt()}
            onAddGroup={() => handleAddGroupAt()}
            onOpenEmbedDialog={() => setEmbedDialogOpen(true)}
            onOpenLinkDialog={() => setLinkDialogOpen(true)}
            onTriggerUploadImage={() => fileInputRef.current?.click()}
            uploading={uploading}
            gridMode={gridMode}
            onGridModeChange={handleGridModeChange}
            nodeCount={nodes.length}
            edgeCount={edges.length}
            onClearCanvas={handleClearCanvas}
            minimapOpen={minimapOpen}
            onToggleMinimap={() => setMinimapOpen((prev) => !prev)}
            zoom={zoom}
            onZoomChange={handleZoomChange}
            shortcutsOpen={shortcutsOpen}
            onShortcutsOpenChange={setShortcutsOpen}
          />

          <CanvasContextMenu
            menu={contextMenu}
            selectedCount={selectedIds.length}
            onClose={() => setContextMenu(null)}
            onAddTextAt={(x, y) => handleAddTextNoteAt(x, y)}
            onAddGroupAt={(x, y) => handleAddGroupAt(x, y)}
            onOpenLinkDialog={() => setLinkDialogOpen(true)}
            onOpenEmbedDialog={() => setEmbedDialogOpen(true)}
            onFitView={handleFitView}
            onDuplicateNode={handleDuplicateSingle}
            onGroupSelected={handleGroupSelected}
            onUngroupNode={handleUngroupNode}
            onDeleteNode={handleDeleteSingle}
          />
        </div>

        <Dialog open={embedDialogOpen} onOpenChange={setEmbedDialogOpen}>
          <DialogBackdrop {...stylex.props(styles.dialogBackdrop)} />
          <DialogContent {...stylex.props(styles.dialogContent)}>
            <Stack gap="md">
              <Stack gap="xs">
                <DialogTitle {...stylex.props(styles.dialogTitle)}>
                  Embed Merak Node on Canvas
                </DialogTitle>
                <DialogDescription {...stylex.props(styles.dialogDesc)}>
                  Creates a JSON Canvas <code>file</code> node linked to a Merak{" "}
                  <code>nodeId</code> with LOD preview activation.
                </DialogDescription>
              </Stack>

              <Card variant="subtle" padding="sm">
                <Stack gap="sm">
                  <Field>
                    <FieldLabel>Node ID</FieldLabel>
                    <Input
                      value={embedNodeId}
                      onValueChange={setEmbedNodeId}
                      placeholder="e.g. node_abc123"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Display Label (optional)</FieldLabel>
                    <Input
                      value={embedLabel}
                      onValueChange={setEmbedLabel}
                      placeholder="Architecture Spec"
                    />
                  </Field>
                </Stack>
              </Card>

              <div {...stylex.props(styles.dialogActions)}>
                <DialogClose>Cancel</DialogClose>
                <Button
                  disabled={embedNodeId.trim().length === 0}
                  onClick={handleConfirmEmbedNode}
                >
                  Add Card
                </Button>
              </div>
            </Stack>
          </DialogContent>
        </Dialog>

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogBackdrop {...stylex.props(styles.dialogBackdrop)} />
          <DialogContent {...stylex.props(styles.dialogContent)}>
            <Stack gap="md">
              <Stack gap="xs">
                <DialogTitle {...stylex.props(styles.dialogTitle)}>
                  Add Link Card
                </DialogTitle>
                <DialogDescription {...stylex.props(styles.dialogDesc)}>
                  Add a JSON Canvas <code>link</code> node pointing to an external URL.
                </DialogDescription>
              </Stack>

              <Card variant="subtle" padding="sm">
                <Field>
                  <FieldLabel>URL</FieldLabel>
                  <Input
                    type="url"
                    value={linkUrl}
                    onValueChange={setLinkUrl}
                    placeholder="https://example.com"
                  />
                </Field>
              </Card>

              <div {...stylex.props(styles.dialogActions)}>
                <DialogClose>Cancel</DialogClose>
                <Button disabled={!isLinkValid} onClick={handleConfirmAddLink}>
                  Add Link
                </Button>
              </div>
            </Stack>
          </DialogContent>
        </Dialog>
      </section>
    </CanvasEditorContext.Provider>
  );
}

export function CanvasEditor(props: AssetEditorProps) {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner {...props} />
    </ReactFlowProvider>
  );
}
