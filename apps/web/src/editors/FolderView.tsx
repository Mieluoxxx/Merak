import type { AssetEditorProps, NodeTreeItemDto, NodeType } from "@merak/shared";
import { Badge, Button, EmptyState, Inline } from "@merak/ui";
import { colors, font, radius, shadow, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Blocks,
  FileText,
  Folder,
  FolderPlus,
  Network,
  PenTool,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { fetchSpaceTree, workspaceQueryKeys } from "../features/api/workspace-api.js";
import { NODE_TYPE_META } from "./shared.js";

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    height: "100%",
    minHeight: 0,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    flexWrap: "wrap",
    paddingTop: space.xs,
    paddingBottom: space.sm,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
  },
  countText: {
    fontFamily: font.sans,
    fontSize: font.sizeXs,
    color: colors.textMuted,
  },
  actionBtn: {
    height: "28px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "10px",
    paddingRight: "10px",
    fontSize: font.sizeXs,
    borderRadius: radius.md,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: space.sm,
    alignContent: "start",
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    width: "100%",
    paddingTop: "12px",
    paddingBottom: "12px",
    paddingLeft: "14px",
    paddingRight: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: colors.borderSubtle,
      ":hover": colors.border,
    },
    borderRadius: radius.lg,
    backgroundColor: {
      default: colors.bgSubtle,
      ":hover": colors.bgHover,
    },
    boxShadow: {
      default: "none",
      ":hover": shadow.sm,
    },
    color: colors.text,
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: "background-color, border-color, box-shadow",
    transitionDuration: "140ms",
  },
  cardIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    color: colors.textMuted,
    flexShrink: 0,
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    flex: "1 1 auto",
  },
  cardTitle: {
    fontFamily: font.sans,
    fontSize: font.sizeSm,
    fontWeight: 500,
    color: colors.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardMeta: {
    fontFamily: font.sans,
    fontSize: font.sizeXs,
    color: colors.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  loadingBox: {
    paddingTop: space.xl,
    paddingBottom: space.xl,
    textAlign: "center",
    fontFamily: font.sans,
    fontSize: font.sizeSm,
    color: colors.textMuted,
  },
});

function findNodeInTree(
  nodes: readonly NodeTreeItemDto[],
  targetId: string,
): NodeTreeItemDto | null {
  for (const entry of nodes) {
    if (entry.id === targetId) {
      return entry;
    }
    if (entry.children.length > 0) {
      const nested = findNodeInTree(entry.children, targetId);
      if (nested) return nested;
    }
  }
  return null;
}

function renderItemIcon(type: NodeType) {
  switch (type) {
    case "folder":
      return <Folder size={16} />;
    case "excalidraw":
      return <PenTool size={16} />;
    case "html":
      return <Blocks size={16} />;
    case "canvas":
      return <Network size={16} />;
    default:
      return <FileText size={16} />;
  }
}

export function FolderView({
  node,
  readOnly = false,
  onCreateChild,
  onOpenNode,
}: AssetEditorProps) {
  const queryClient = useQueryClient();
  const [creatingType, setCreatingType] = useState<NodeType | null>(null);

  const treeQuery = useQuery({
    queryKey: workspaceQueryKeys.tree(node.spaceId),
    queryFn: () => fetchSpaceTree(node.spaceId),
    enabled: Boolean(node.spaceId),
  });

  const children = useMemo(() => {
    const folderNode = findNodeInTree(treeQuery.data ?? [], node.id);
    if (!folderNode) return [];
    return [...folderNode.children].sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return 0;
    });
  }, [node.id, treeQuery.data]);

  const handleCreate = async (type: NodeType) => {
    if (readOnly || creatingType !== null) return;
    setCreatingType(type);
    try {
      const created = await onCreateChild({
        type,
        title: NODE_TYPE_META[type].defaultChildTitle,
      });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(node.spaceId),
      });
      onOpenNode(created.id);
    } finally {
      setCreatingType(null);
    }
  };

  return (
    <section aria-label={`Folder: ${node.title}`} {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <Inline gap="sm">
          <Badge tone="accent">Folder</Badge>
          <span {...stylex.props(styles.countText)}>
            {children.length} {children.length === 1 ? "item" : "items"}
          </span>
        </Inline>

        {!readOnly ? (
          <Inline gap="xs" wrap>
            <Button
              disabled={creatingType !== null}
              onClick={() => void handleCreate("folder")}
              {...stylex.props(styles.actionBtn)}
            >
              <FolderPlus size={13} />
              <span>Subfolder</span>
            </Button>
            <Button
              disabled={creatingType !== null}
              onClick={() => void handleCreate("doc")}
              {...stylex.props(styles.actionBtn)}
            >
              <Plus size={13} />
              <span>Page</span>
            </Button>
            <Button
              disabled={creatingType !== null}
              onClick={() => void handleCreate("excalidraw")}
              {...stylex.props(styles.actionBtn)}
            >
              <PenTool size={13} />
              <span>Whiteboard</span>
            </Button>
            <Button
              disabled={creatingType !== null}
              onClick={() => void handleCreate("html")}
              {...stylex.props(styles.actionBtn)}
            >
              <Blocks size={13} />
              <span>HTML</span>
            </Button>
            <Button
              disabled={creatingType !== null}
              onClick={() => void handleCreate("canvas")}
              {...stylex.props(styles.actionBtn)}
            >
              <Network size={13} />
              <span>Canvas</span>
            </Button>
          </Inline>
        ) : null}
      </div>

      {treeQuery.isLoading ? (
        <div {...stylex.props(styles.loadingBox)}>Loading folder contents...</div>
      ) : children.length === 0 ? (
        <EmptyState
          icon={<Folder size={26} />}
          title="This folder is empty"
          description="Organize your Knowledge Base with nested subfolders, Markdown pages, whiteboards, HTML artifacts, or canvases."
          action={
            !readOnly ? (
              <Inline gap="sm" wrap justify="center">
                <Button
                  data-variant="solid"
                  disabled={creatingType !== null}
                  onClick={() => void handleCreate("folder")}
                >
                  <FolderPlus size={14} />
                  <span>New Subfolder</span>
                </Button>
                <Button
                  disabled={creatingType !== null}
                  onClick={() => void handleCreate("doc")}
                >
                  <FileText size={14} />
                  <span>New Page</span>
                </Button>
              </Inline>
            ) : undefined
          }
        />
      ) : (
        <div {...stylex.props(styles.grid)}>
          {children.map((child) => {
            const meta = NODE_TYPE_META[child.type];
            const subtitle =
              child.type === "folder"
                ? `${child.children.length} ${child.children.length === 1 ? "item" : "items"}`
                : meta.shortLabel;
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => onOpenNode?.(child.id)}
                {...stylex.props(styles.card)}
              >
                <span {...stylex.props(styles.cardIcon)}>
                  {renderItemIcon(child.type)}
                </span>
                <span {...stylex.props(styles.cardBody)}>
                  <span {...stylex.props(styles.cardTitle)}>{child.title}</span>
                  <span {...stylex.props(styles.cardMeta)}>{subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
