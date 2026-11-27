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
  Toolbar,
} from "@merak/ui";
import { colors, font, radius, shadow, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  addEdge,
  Background,
  type Connection,
  Controls,
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
  useViewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Blocks,
  BoxSelect,
  ExternalLink,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Link2,
  Maximize2,
  Minimize2,
  Network,
  PenTool,
  Save,
  StickyNote,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import "./editors.css";
import { countActiveExcalidrawElements, parseExcalidrawContent } from "./excalidrawHelpers.js";
import { extractDocExcerpt } from "./markdownHelpers.js";
import { formatMediaUrl, NODE_TYPE_META, useGlobalSaveShortcut } from "./shared.js";

interface CanvasEditorContextValue {
  readOnly: boolean;
  activatedNodeId: string | null;
  setActivatedNodeId: (id: string | null) => void;
  updateNodeData: (nodeId: string, updater: (node: MerakFlowNode) => MerakFlowNode) => void;
  onOpenNode: (nodeId: string) => void;
  resolveNode?: (nodeId: string) => Promise<NodeDetailDto | null>;
}

const CanvasEditorContext = createContext<CanvasEditorContextValue>({
  readOnly: false,
  activatedNodeId: null,
  setActivatedNodeId: () => {},
  updateNodeData: () => {},
  onOpenNode: () => {},
});

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: "480px",
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
    maxWidth: "220px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  flowWrap: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    width: "100%",
    backgroundColor: colors.bg,
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
    border: `1px solid ${colors.border}`,
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
    paddingBlock: space.xs,
    paddingInline: space.sm,
    backgroundColor: colors.bgSubtle,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    fontSize: font.sizeXs,
    fontWeight: 600,
    color: colors.textMuted,
  },
  textBody: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    padding: space.xs,
  },
  textarea: {
    width: "100%",
    height: "100%",
    resize: "none",
    border: "none",
    backgroundColor: "transparent",
    color: colors.text,
    fontFamily: font.sans,
    fontSize: font.sizeSm,
    lineHeight: 1.5,
    padding: space.xs,
    outline: "none",
  },
  groupNode: {
    width: "100%",
    height: "100%",
    borderRadius: radius.lg,
    border: `2px dashed ${colors.border}`,
    backgroundColor: colors.accentSubtle,
    padding: space.sm,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  groupLabelInput: {
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    paddingBlock: space.xxs,
    paddingInline: space.sm,
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
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.sm,
    overflow: "hidden",
  },
  linkBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: space.sm,
    padding: space.sm,
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
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.sm,
    overflow: "hidden",
  },
  fileBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: space.sm,
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
    margin: 0,
  },
  filePreviewText: {
    margin: 0,
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
    border: `1px solid ${colors.borderSubtle}`,
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
  const { readOnly, updateNodeData } = useContext(CanvasEditorContext);
  const textData = data as CanvasTextFlowData;

  return (
    <div {...stylex.props(styles.textNode, selected && styles.nodeSelected)}>
      <NodeResizer isVisible={Boolean(selected && !readOnly)} minWidth={180} minHeight={100} />
      <FourSideHandles />
      <div {...stylex.props(styles.nodeHeader)}>
        <Inline gap="xs">
          <StickyNote size={13} />
          <span>Note</span>
        </Inline>
      </div>
      <div className="nodrag nopan" {...stylex.props(styles.textBody)}>
        <Textarea
          value={textData.text}
          readOnly={readOnly}
          placeholder="Write a note..."
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
      </div>
    </div>
  );
}

function CanvasGroupNodeComponent({ id, data, selected }: NodeProps<MerakFlowNode>) {
  const { readOnly, updateNodeData } = useContext(CanvasEditorContext);
  const groupData = data as CanvasGroupFlowData;

  return (
    <div {...stylex.props(styles.groupNode, selected && styles.nodeSelected)}>
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
  const { readOnly, updateNodeData } = useContext(CanvasEditorContext);
  const linkData = data as CanvasLinkFlowData;

  let hostname = linkData.url;
  try {
    hostname = new URL(linkData.url).hostname;
  } catch {
    // Keep raw URL when not parseable.
  }

  return (
    <div {...stylex.props(styles.linkNode, selected && styles.nodeSelected)}>
      <NodeResizer isVisible={Boolean(selected && !readOnly)} minWidth={200} minHeight={110} />
      <FourSideHandles />
      <div {...stylex.props(styles.nodeHeader)}>
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
  const { activatedNodeId, setActivatedNodeId, onOpenNode, resolveNode } =
    useContext(CanvasEditorContext);
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
      if (resolved.type === "doc") {
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

  return (
    <div
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
      <NodeResizer isVisible={Boolean(selected)} minWidth={220} minHeight={120} />
      <FourSideHandles />
      <div {...stylex.props(styles.nodeHeader)}>
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
  const initialFlow = useMemo(
    () => canvasDocumentToFlow(parseCanvasContent(node.content)),
    [node.id],
  );

  const [nodes, setNodes] = useState<MerakFlowNode[]>(initialFlow.nodes);
  const [edges, setEdges] = useState<MerakFlowEdge[]>(initialFlow.edges);
  const [activatedNodeId, setActivatedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [embedNodeId, setEmbedNodeId] = useState("");
  const [embedLabel, setEmbedLabel] = useState("");

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const lastSerializedRef = useRef<string>(
    JSON.stringify(flowToCanvasDocument(initialFlow.nodes, initialFlow.edges), null, 2),
  );
  const lastNodeIdRef = useRef(node.id);

  // Re-hydrate when switching to a different canvas node.
  useEffect(() => {
    if (lastNodeIdRef.current !== node.id) {
      lastNodeIdRef.current = node.id;
      const parsed = parseCanvasContent(node.content);
      const nextFlow = canvasDocumentToFlow(parsed);
      setNodes(nextFlow.nodes);
      setEdges(nextFlow.edges);
      setActivatedNodeId(null);
      nodesRef.current = nextFlow.nodes;
      edgesRef.current = nextFlow.edges;
      lastSerializedRef.current = JSON.stringify(parsed, null, 2);
    }
  }, [node.id, node.content]);

  const emitCanvasIfChanged = useCallback(
    (nextNodes: readonly MerakFlowNode[], nextEdges: readonly MerakFlowEdge[]) => {
      if (readOnly) return;
      const serialized = JSON.stringify(flowToCanvasDocument(nextNodes, nextEdges), null, 2);
      if (serialized !== lastSerializedRef.current) {
        lastSerializedRef.current = serialized;
        onChangeRef.current(serialized);
      }
    },
    [readOnly],
  );

  const handleNodesChange: OnNodesChange<MerakFlowNode> = useCallback(
    (changes) => {
      const nextNodes = changes.applyTo(nodesRef.current);
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      emitCanvasIfChanged(nextNodes, edgesRef.current);
    },
    [emitCanvasIfChanged],
  );

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
      const nextNodes =
        nextNode.type === "canvasGroup"
          ? [nextNode, ...nodesRef.current]
          : [...nodesRef.current, nextNode];
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      emitCanvasIfChanged(nextNodes, edgesRef.current);
    },
    [emitCanvasIfChanged],
  );

  const nextSpawnPosition = () => {
    const offset = (nodesRef.current.length % 8) * 32;
    return { x: 80 + offset, y: 80 + offset };
  };

  const handleAddTextNote = () => {
    appendNode({
      id: makeNodeId("text"),
      type: "canvasText",
      position: nextSpawnPosition(),
      width: 280,
      height: 160,
      style: { width: 280, height: 160 },
      data: {
        canvasType: "text",
        text: "New note",
      },
    });
  };

  const handleAddGroup = () => {
    appendNode({
      id: makeNodeId("group"),
      type: "canvasGroup",
      zIndex: -1,
      position: nextSpawnPosition(),
      width: 440,
      height: 300,
      style: { width: 440, height: 300 },
      data: {
        canvasType: "group",
        label: "Group",
      },
    });
  };

  const handleConfirmEmbedNode = () => {
    const trimmedId = embedNodeId.trim();
    if (!trimmedId) return;
    appendNode({
      id: makeNodeId("file"),
      type: "canvasFile",
      position: nextSpawnPosition(),
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
      appendNode({
        id: makeNodeId("link"),
        type: "canvasLink",
        position: nextSpawnPosition(),
        width: 280,
        height: 130,
        style: { width: 280, height: 130 },
        data: {
          canvasType: "link",
          url: parsed.toString(),
        },
      });
      setLinkUrl("https://");
      setLinkDialogOpen(false);
    } catch {
      // Ignore invalid URL until user enters a valid http(s) URL.
    }
  };

  const handleUploadImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || readOnly) return;

    setUploading(true);
    try {
      const media = await onUploadMedia(file);
      const mediaUrl = formatMediaUrl(media);
      appendNode({
        id: makeNodeId("media"),
        type: "canvasFile",
        position: nextSpawnPosition(),
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
  };

  const handleSave = useCallback(async () => {
    if (!onSaveRef.current || readOnly) return;
    setSaving(true);
    try {
      const serialized = JSON.stringify(
        flowToCanvasDocument(nodesRef.current, edgesRef.current),
        null,
        2,
      );
      lastSerializedRef.current = serialized;
      await onSaveRef.current(serialized);
    } finally {
      setSaving(false);
    }
  }, [readOnly]);

  useGlobalSaveShortcut(Boolean(onSave) && !readOnly, handleSave);

  const contextValue = useMemo<CanvasEditorContextValue>(
    () => ({
      readOnly,
      activatedNodeId,
      setActivatedNodeId,
      updateNodeData,
      onOpenNode,
      resolveNode,
    }),
    [readOnly, activatedNodeId, updateNodeData, onOpenNode, resolveNode],
  );

  const isLinkValid = useMemo(() => {
    try {
      new URL(linkUrl.trim());
      return true;
    } catch {
      return false;
    }
  }, [linkUrl]);

  return (
    <CanvasEditorContext.Provider value={contextValue}>
      <section
        aria-label={`Infinite Canvas Editor: ${node.title}`}
        {...stylex.props(styles.root)}
      >
        <Toolbar aria-label="Canvas toolbar" {...stylex.props(styles.toolbar)}>
          <Inline gap="sm">
            <Network size={16} />
            <span {...stylex.props(styles.titleText)}>{node.title}</span>
            <Badge tone="accent">Canvas 1.0</Badge>
            <Badge tone="neutral">
              {nodes.length} nodes · {edges.length} edges
            </Badge>
            {readOnly ? <Badge tone="neutral">Read-only</Badge> : null}
          </Inline>

          <Inline gap="xs">
            {!readOnly ? (
              <>
                <Button onClick={handleAddTextNote}>
                  <StickyNote size={14} />
                  Text Note
                </Button>
                <Button onClick={handleAddGroup}>
                  <BoxSelect size={14} />
                  Group
                </Button>
                <Button onClick={() => setEmbedDialogOpen(true)}>
                  <FileText size={14} />
                  Embed Node
                </Button>
                <Button onClick={() => setLinkDialogOpen(true)}>
                  <Link2 size={14} />
                  Link
                </Button>
                <Button
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  {uploading ? "Uploading..." : "Upload Image"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadImageChange}
                  {...stylex.props(styles.hiddenInput)}
                />
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

        <div className="merak-canvas-host" {...stylex.props(styles.flowWrap)}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={CANVAS_NODE_TYPES}
            forceColorMode={theme}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onPaneClick={() => setActivatedNodeId(null)}
            fitView={nodes.length > 0}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>

          {nodes.length === 0 ? (
            <EmptyState
              icon={<Network size={28} />}
              title="Empty Infinite Canvas"
              description="Add text notes, groups, embedded Merak nodes, links, or uploaded images from the toolbar."
            />
          ) : null}
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
