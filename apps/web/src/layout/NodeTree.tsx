import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { NodeDetailDto, NodeTreeItemDto, NodeType } from "@merak/shared";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldLabel,
  Inline,
  Input,
  Menu,
  MenuContent,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
  Stack,
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  toast,
} from "@merak/ui";
import { colors, font, radius, shadow, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Blocks,
  ChevronRight,
  FileText,
  GripVertical,
  MoreHorizontal,
  Network,
  PenTool,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createNode,
  deleteNode,
  fetchSpaceTree,
  moveNode,
  updateNode,
  workspaceQueryKeys,
} from "../features/api/workspace-api.js";
import {
  buildNodeTree,
  collectVisibleNodeIds,
  computeMovePlan,
  getAncestorIds,
  getDescendantIds,
  indexTreeById,
  isDescendant,
  type DropIntent,
} from "./tree-utils.js";

export interface NodeTreeProps {
  spaceId: string;
  nodes?: NodeTreeItemDto[];
  selectedNodeId?: string | null;
  showRootCreateButton?: boolean;
  onSelectNode: (nodeId: string, spaceId: string) => void;
  onNodeCreated?: (node: NodeDetailDto) => void;
  onNodeDeleted?: (nodeId: string, spaceId: string) => void;
}

const DEFAULT_TITLES: Record<NodeType, string> = {
  doc: "Untitled Page",
  excalidraw: "Untitled Whiteboard",
  html: "Untitled HTML Artifact",
  canvas: "Untitled Canvas",
};

const styles = stylex.create({
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  treeRoot: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    outline: "none",
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    paddingLeft: space.md,
    marginLeft: space.sm,
    borderLeft: `1px solid ${colors.borderSubtle}`,
  },
  rowShell: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: space.xxs,
    borderRadius: radius.sm,
    paddingBlock: "3px",
    paddingInline: space.xs,
    color: colors.textMuted,
    fontSize: font.sizeSm,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
  },
  rowSelected: {
    backgroundColor: colors.bgActive,
    color: colors.text,
    fontWeight: 500,
  },
  rowDragging: {
    opacity: 0.4,
  },
  rowDropInside: {
    backgroundColor: colors.accentSubtle,
    outline: `1px solid ${colors.accent}`,
  },
  rowDropBefore: {
    boxShadow: `inset 0 2px 0 0 ${colors.accent}`,
  },
  rowDropAfter: {
    boxShadow: `inset 0 -2px 0 0 ${colors.accent}`,
  },
  rowInvalidTarget: {
    opacity: 0.45,
  },
  dragHandle: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "20px",
    color: colors.textSubtle,
    cursor: "grab",
    flexShrink: 0,
    backgroundColor: "transparent",
    border: "none",
    padding: 0,
  },
  indicator: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "18px",
    flexShrink: 0,
    color: colors.textSubtle,
    cursor: "pointer",
  },
  indicatorSpacer: {
    display: "inline-block",
    width: "18px",
    height: "18px",
    flexShrink: 0,
  },
  chevronExpanded: {
    transform: "rotate(90deg)",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    minWidth: 0,
    flex: "1 1 auto",
    cursor: "pointer",
    userSelect: "none",
  },
  labelText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  nodeIcon: {
    flexShrink: 0,
    color: colors.textSubtle,
  },
  rowActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    flexShrink: 0,
  },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: radius.sm,
    border: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgActive,
    },
    color: colors.textSubtle,
    cursor: "pointer",
    padding: 0,
  },
  emptyHint: {
    paddingBlock: space.xs,
    paddingInline: space.sm,
    fontSize: font.sizeXs,
    color: colors.textSubtle,
  },
  overlayCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.accent}`,
    boxShadow: shadow.md,
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: 500,
  },
  dialogContent: {
    width: "100%",
    maxWidth: "400px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    marginTop: space.md,
  },
});

function NodeTypeIcon({ type }: { type: NodeType }) {
  switch (type) {
    case "excalidraw":
      return <PenTool size={14} {...stylex.props(styles.nodeIcon)} />;
    case "html":
      return <Blocks size={14} {...stylex.props(styles.nodeIcon)} />;
    case "canvas":
      return <Network size={14} {...stylex.props(styles.nodeIcon)} />;
    default:
      return <FileText size={14} {...stylex.props(styles.nodeIcon)} />;
  }
}

interface SortableTreeBranchProps {
  node: NodeTreeItemDto;
  selectedNodeId: string | null;
  expandedSet: ReadonlySet<string>;
  activeDragId: string | null;
  overNodeId: string | null;
  dropIntent: DropIntent | null;
  invalidDropIds: ReadonlySet<string>;
  onSelect: (nodeId: string) => void;
  onCreateChild: (parentId: string, type: NodeType) => void;
  onStartRename: (node: NodeTreeItemDto) => void;
  onStartDelete: (node: NodeTreeItemDto) => void;
}

function SortableTreeBranch({
  node,
  selectedNodeId,
  expandedSet,
  activeDragId,
  overNodeId,
  dropIntent,
  invalidDropIds,
  onSelect,
  onCreateChild,
  onStartRename,
  onStartDelete,
}: SortableTreeBranchProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedSet.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const isInvalidTarget = activeDragId !== null && invalidDropIds.has(node.id);
  const isOver = overNodeId === node.id && !isInvalidTarget && activeDragId !== node.id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  });

  const sortableStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <TreeItem value={node.id} branch={hasChildren} label={node.title}>
      <div
        ref={setNodeRef}
        style={sortableStyle}
        data-node-id={node.id}
        {...stylex.props(
          styles.rowShell,
          isSelected && styles.rowSelected,
          isDragging && styles.rowDragging,
          isInvalidTarget && styles.rowInvalidTarget,
          isOver && dropIntent === "inside" && styles.rowDropInside,
          isOver && dropIntent === "before" && styles.rowDropBefore,
          isOver && dropIntent === "after" && styles.rowDropAfter,
        )}
      >
        <button
          type="button"
          aria-label={`Drag ${node.title}`}
          {...attributes}
          {...listeners}
          {...stylex.props(styles.dragHandle)}
        >
          <GripVertical size={12} />
        </button>

        {hasChildren ? (
          <TreeItemIndicator {...stylex.props(styles.indicator)}>
            <ChevronRight
              size={13}
              {...stylex.props(isExpanded && styles.chevronExpanded)}
            />
          </TreeItemIndicator>
        ) : (
          <span {...stylex.props(styles.indicatorSpacer)} />
        )}

        <TreeItemLabel
          onClick={() => onSelect(node.id)}
          {...stylex.props(styles.label)}
        >
          <NodeTypeIcon type={node.type} />
          <span title={node.title} {...stylex.props(styles.labelText)}>
            {node.title}
          </span>
        </TreeItemLabel>

        <div {...stylex.props(styles.rowActions)}>
          <Menu>
            <MenuTrigger
              aria-label={`Create child under ${node.title}`}
              onClick={(event) => event.stopPropagation()}
              {...stylex.props(styles.iconButton)}
            >
              <Plus size={13} />
            </MenuTrigger>
            <MenuContent align="end" sideOffset={4}>
              <MenuGroupLabel>New Child Asset</MenuGroupLabel>
              <MenuItem
                value={`create:${node.id}:doc`}
                onSelect={() => onCreateChild(node.id, "doc")}
              >
                <MenuItemIcon>
                  <FileText size={13} />
                </MenuItemIcon>
                <span>Markdown Page</span>
              </MenuItem>
              <MenuItem
                value={`create:${node.id}:excalidraw`}
                onSelect={() => onCreateChild(node.id, "excalidraw")}
              >
                <MenuItemIcon>
                  <PenTool size={13} />
                </MenuItemIcon>
                <span>Excalidraw Whiteboard</span>
              </MenuItem>
              <MenuItem
                value={`create:${node.id}:html`}
                onSelect={() => onCreateChild(node.id, "html")}
              >
                <MenuItemIcon>
                  <Blocks size={13} />
                </MenuItemIcon>
                <span>HTML Artifact</span>
              </MenuItem>
              <MenuItem
                value={`create:${node.id}:canvas`}
                onSelect={() => onCreateChild(node.id, "canvas")}
              >
                <MenuItemIcon>
                  <Network size={13} />
                </MenuItemIcon>
                <span>Infinite Canvas</span>
              </MenuItem>
            </MenuContent>
          </Menu>

          <Menu>
            <MenuTrigger
              aria-label={`More actions for ${node.title}`}
              onClick={(event) => event.stopPropagation()}
              {...stylex.props(styles.iconButton)}
            >
              <MoreHorizontal size={13} />
            </MenuTrigger>
            <MenuContent align="end" sideOffset={4}>
              <MenuItem
                value={`rename:${node.id}`}
                onSelect={() => onStartRename(node)}
              >
                <MenuItemIcon>
                  <Pencil size={13} />
                </MenuItemIcon>
                <span>Rename</span>
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                value={`delete:${node.id}`}
                destructive
                onSelect={() => onStartDelete(node)}
              >
                <MenuItemIcon>
                  <Trash2 size={13} />
                </MenuItemIcon>
                <span>Move to Trash</span>
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      {hasChildren ? (
        <TreeGroup {...stylex.props(styles.group)}>
          {node.children.map((child) => (
            <SortableTreeBranch
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              expandedSet={expandedSet}
              activeDragId={activeDragId}
              overNodeId={overNodeId}
              dropIntent={dropIntent}
              invalidDropIds={invalidDropIds}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onStartRename={onStartRename}
              onStartDelete={onStartDelete}
            />
          ))}
        </TreeGroup>
      ) : null}
    </TreeItem>
  );
}

function detectDropIntent(event: DragOverEvent | DragMoveEvent): DropIntent {
  const overRect = event.over?.rect;
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  if (!overRect || !activeRect || overRect.height <= 0) {
    return "inside";
  }
  const activeCenterY = activeRect.top + activeRect.height / 2;
  const relativeY = (activeCenterY - overRect.top) / overRect.height;
  if (relativeY < 0.25) return "before";
  if (relativeY > 0.75) return "after";
  return "inside";
}

export function NodeTree({
  spaceId,
  nodes: providedNodes,
  selectedNodeId = null,
  showRootCreateButton = false,
  onSelectNode,
  onNodeCreated,
  onNodeDeleted,
}: NodeTreeProps) {
  const queryClient = useQueryClient();

  const treeQuery = useQuery({
    queryKey: workspaceQueryKeys.tree(spaceId),
    queryFn: () => fetchSpaceTree(spaceId),
    enabled: providedNodes === undefined && Boolean(spaceId),
  });

  const roots = useMemo(
    () => buildNodeTree(providedNodes ?? treeQuery.data ?? []),
    [providedNodes, treeQuery.data],
  );
  const nodeMap = useMemo(() => indexTreeById(roots), [roots]);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  // Automatically expand ancestors of the selected node
  useEffect(() => {
    if (!selectedNodeId) return;
    const ancestors = getAncestorIds(roots, selectedNodeId);
    if (ancestors.length === 0) return;
    setExpandedIds((prev) => {
      const merged = new Set(prev);
      let changed = false;
      for (const ancestorId of ancestors) {
        if (!merged.has(ancestorId)) {
          merged.add(ancestorId);
          changed = true;
        }
      }
      return changed ? [...merged] : prev;
    });
  }, [roots, selectedNodeId]);

  const visibleNodeIds = useMemo(
    () => collectVisibleNodeIds(roots, expandedSet),
    [roots, expandedSet],
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overNodeId, setOverNodeId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);

  const [renameTarget, setRenameTarget] = useState<NodeTreeItemDto | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NodeTreeItemDto | null>(null);

  const invalidDropIds = useMemo(
    () => (activeDragId ? getDescendantIds(roots, activeDragId) : new Set<string>()),
    [activeDragId, roots],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const createMutation = useMutation({
    mutationFn: createNode,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(spaceId) });
      if (created.parentId) {
        setExpandedIds((prev) =>
          prev.includes(created.parentId!) ? prev : [...prev, created.parentId!],
        );
      }
      onNodeCreated?.(created);
      onSelectNode(created.id, spaceId);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create node");
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ nodeId, title }: { nodeId: string; title: string }) =>
      updateNode(nodeId, { title }),
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(spaceId) }),
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.node(updated.id) }),
      ]);
      setRenameTarget(null);
      toast.success(`Renamed to "${updated.title}"`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to rename node");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNode,
    onSuccess: async (_data, deletedId) => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(spaceId) });
      setDeleteTarget(null);
      onNodeDeleted?.(deletedId, spaceId);
      toast.success("Moved page to trash");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete node");
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({
      nodeId,
      parentId,
      sortOrder,
    }: {
      nodeId: string;
      parentId: string | null;
      sortOrder: string;
    }) => moveNode(nodeId, { parentId, sortOrder }),
    onSuccess: async (_updated, variables) => {
      if (variables.parentId) {
        setExpandedIds((prev) =>
          prev.includes(variables.parentId!) ? prev : [...prev, variables.parentId!],
        );
      }
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.tree(spaceId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to move node");
    },
  });

  const handleCreateNode = (parentId: string | null, type: NodeType) => {
    createMutation.mutate({
      spaceId,
      parentId,
      type,
      title: DEFAULT_TITLES[type],
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    setOverNodeId(null);
    setDropIntent(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) {
      setOverNodeId(null);
      setDropIntent(null);
      return;
    }
    setOverNodeId(String(event.over.id));
    setDropIntent(detectDropIntent(event));
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (!event.over) return;
    setOverNodeId(String(event.over.id));
    setDropIntent(detectDropIntent(event));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const draggedId = String(event.active.id);
    const targetId = event.over ? String(event.over.id) : null;
    const intent = dropIntent ?? "inside";

    setActiveDragId(null);
    setOverNodeId(null);
    setDropIntent(null);

    if (!targetId || draggedId === targetId) return;

    if (isDescendant(roots, draggedId, targetId)) {
      toast.error("Cannot move a node into itself or one of its descendants.");
      return;
    }

    const plan = computeMovePlan(roots, draggedId, targetId, intent);
    if (!plan) return;

    moveMutation.mutate({
      nodeId: plan.nodeId,
      parentId: plan.parentId,
      sortOrder: plan.sortOrder,
    });
  };

  const handleRenameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameTarget) return;
    const trimmed = renameTitle.trim();
    if (!trimmed) return;
    renameMutation.mutate({ nodeId: renameTarget.id, title: trimmed });
  };

  const activeDragNode = activeDragId ? nodeMap.get(activeDragId) ?? null : null;

  return (
    <div data-slot="merak-node-tree" {...stylex.props(styles.wrapper)}>
      {showRootCreateButton ? (
        <Menu>
          <MenuTrigger>
            <Plus size={13} />
            <span>New Asset</span>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuGroupLabel>Create in Space Root</MenuGroupLabel>
            <MenuItem value="root:doc" onSelect={() => handleCreateNode(null, "doc")}>
              <MenuItemIcon>
                <FileText size={13} />
              </MenuItemIcon>
              <span>Markdown Page</span>
            </MenuItem>
            <MenuItem
              value="root:excalidraw"
              onSelect={() => handleCreateNode(null, "excalidraw")}
            >
              <MenuItemIcon>
                <PenTool size={13} />
              </MenuItemIcon>
              <span>Excalidraw Whiteboard</span>
            </MenuItem>
            <MenuItem value="root:html" onSelect={() => handleCreateNode(null, "html")}>
              <MenuItemIcon>
                <Blocks size={13} />
              </MenuItemIcon>
              <span>HTML Artifact</span>
            </MenuItem>
            <MenuItem value="root:canvas" onSelect={() => handleCreateNode(null, "canvas")}>
              <MenuItemIcon>
                <Network size={13} />
              </MenuItemIcon>
              <span>Infinite Canvas</span>
            </MenuItem>
          </MenuContent>
        </Menu>
      ) : null}

      {treeQuery.isLoading && providedNodes === undefined ? (
        <div {...stylex.props(styles.emptyHint)}>Loading pages...</div>
      ) : roots.length === 0 ? (
        <div {...stylex.props(styles.emptyHint)}>No pages yet</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveDragId(null);
            setOverNodeId(null);
            setDropIntent(null);
          }}
        >
          <SortableContext items={visibleNodeIds} strategy={verticalListSortingStrategy}>
            <Tree
              mode="single"
              aria-label="Space document tree"
              value={selectedNodeId}
              current={selectedNodeId}
              expanded={expandedIds}
              expandOnPress={false}
              onExpandedChange={(nextExpanded) => setExpandedIds(nextExpanded)}
              onValueChange={(nextValue) => {
                if (typeof nextValue === "string") {
                  onSelectNode(nextValue, spaceId);
                }
              }}
              onAction={(value) => onSelectNode(value, spaceId)}
              {...stylex.props(styles.treeRoot)}
            >
              {roots.map((node) => (
                <SortableTreeBranch
                  key={node.id}
                  node={node}
                  selectedNodeId={selectedNodeId}
                  expandedSet={expandedSet}
                  activeDragId={activeDragId}
                  overNodeId={overNodeId}
                  dropIntent={dropIntent}
                  invalidDropIds={invalidDropIds}
                  onSelect={(nodeId) => onSelectNode(nodeId, spaceId)}
                  onCreateChild={(parentId, type) => handleCreateNode(parentId, type)}
                  onStartRename={(target) => {
                    setRenameTarget(target);
                    setRenameTitle(target.title);
                  }}
                  onStartDelete={(target) => setDeleteTarget(target)}
                />
              ))}
            </Tree>
          </SortableContext>

          <DragOverlay>
            {activeDragNode ? (
              <div {...stylex.props(styles.overlayCard)}>
                <NodeTypeIcon type={activeDragNode.type} />
                <span>{activeDragNode.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRenameTarget(null);
        }}
      >
        <DialogBackdrop />
        <DialogContent {...stylex.props(styles.dialogContent)}>
          <DialogTitle>Rename Page</DialogTitle>
          <DialogDescription>
            Update the title shown in the sidebar tree and search index.
          </DialogDescription>
          <form onSubmit={handleRenameSubmit} {...stylex.props(styles.form)}>
            <Stack gap="md">
              <Field name="rename-node-title">
                <FieldLabel>Title</FieldLabel>
                <Input
                  value={renameTitle}
                  onValueChange={(val) => setRenameTitle(val)}
                  autoFocus
                  required
                />
              </Field>
              <Inline justify="end" gap="sm">
                <DialogClose disabled={renameMutation.isPending}>Cancel</DialogClose>
                <Button
                  type="submit"
                  data-variant="solid"
                  disabled={renameMutation.isPending || !renameTitle.trim()}
                >
                  {renameMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </Inline>
            </Stack>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteTarget
              ? `"${deleteTarget.title}" will be soft-deleted and removed from the active tree.`
              : "This page will be soft-deleted."}
          </AlertDialogDescription>
          <Inline justify="end" gap="sm">
            <AlertDialogClose disabled={deleteMutation.isPending}>Cancel</AlertDialogClose>
            <Button
              data-variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Move to Trash"}
            </Button>
          </Inline>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
