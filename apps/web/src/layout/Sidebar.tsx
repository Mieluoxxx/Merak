import type { NodeDetailDto, NodeType, SpaceDto, SpaceKind } from "@merak/shared";
import {
  Button,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
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
  MenuTrigger,
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
  Separator,
  Stack,
  Textarea,
  toast,
  useShortcutHint,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Blocks,
  BookOpen,
  ChevronRight,
  FileText,
  FolderGit2,
  Image as ImageIcon,
  KeyRound,
  Network,
  PenTool,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { WorkbenchView } from "../features/agent/bridge.js";
import {
  createNode,
  createSpace,
  workspaceQueryKeys,
} from "../features/api/workspace-api.js";
import { TeamSwitcher } from "../features/auth/TeamSwitcher.js";
import { NodeTree } from "./NodeTree.js";

export interface SidebarProps {
  spaces: SpaceDto[];
  activeView: WorkbenchView;
  activeSpaceId: string | null;
  selectedNodeId: string | null;
  onSelectView: (view: WorkbenchView) => void;
  onSelectSpace: (spaceId: string) => void;
  onSelectNode: (nodeId: string, spaceId: string) => void;
  onOpenCommandPalette?: () => void;
  onSpaceCreated?: (space: SpaceDto) => void;
  onNodeCreated?: (node: NodeDetailDto) => void;
  onNodeDeleted?: (nodeId: string, spaceId: string) => void;
  onOrganizationChanged?: (organizationId: string) => void;
  onSignedOut?: () => void;
}

const DEFAULT_TITLES: Record<NodeType, string> = {
  doc: "Untitled Page",
  excalidraw: "Untitled Whiteboard",
  html: "Untitled HTML Artifact",
  canvas: "Untitled Canvas",
};

const styles = stylex.create({
  sidebar: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    backgroundColor: colors.bgSubtle,
    borderRight: `1px solid ${colors.border}`,
    color: colors.text,
  },
  topSection: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.md,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  searchButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    width: "100%",
    paddingBlock: "6px",
    paddingInline: space.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bg,
    color: colors.textMuted,
    fontSize: font.sizeSm,
    cursor: "pointer",
  },
  searchHint: {
    fontFamily: font.mono,
    fontSize: "11px",
    color: colors.textSubtle,
  },
  scrollRoot: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  scrollViewport: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
  },
  scrollContent: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    padding: space.md,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    paddingInline: space.xs,
  },
  sectionLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: colors.textSubtle,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  sectionAddButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    borderRadius: radius.sm,
    border: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.textSubtle,
    cursor: "pointer",
    padding: 0,
  },
  spaceRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    borderRadius: radius.sm,
    paddingBlock: "4px",
    paddingInline: space.xs,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
  },
  spaceRowActive: {
    backgroundColor: colors.bgActive,
  },
  spaceTrigger: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    minWidth: 0,
    flex: "1 1 auto",
    border: "none",
    backgroundColor: "transparent",
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
    padding: 0,
  },
  spaceName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chevronOpen: {
    transform: "rotate(90deg)",
  },
  spaceTreeWrap: {
    paddingLeft: space.sm,
    paddingTop: space.xxs,
  },
  emptySpaces: {
    paddingBlock: space.xs,
    paddingInline: space.sm,
    fontSize: font.sizeXs,
    color: colors.textSubtle,
  },
  bottomNav: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.md,
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  navButton: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    width: "100%",
    paddingBlock: "6px",
    paddingInline: space.sm,
    borderRadius: radius.md,
    border: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.textMuted,
    fontSize: font.sizeSm,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
  },
  navButtonActive: {
    backgroundColor: colors.bgActive,
    color: colors.text,
  },
  dialogContent: {
    width: "100%",
    maxWidth: "440px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
    marginTop: space.md,
  },
  errorBanner: {
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    border: `1px solid ${colors.danger}`,
    color: colors.danger,
    fontSize: font.sizeSm,
  },
});

export function Sidebar({
  spaces,
  activeView,
  activeSpaceId,
  selectedNodeId,
  onSelectView,
  onSelectSpace,
  onSelectNode,
  onOpenCommandPalette,
  onSpaceCreated,
  onNodeCreated,
  onNodeDeleted,
  onOrganizationChanged,
  onSignedOut,
}: SidebarProps) {
  const queryClient = useQueryClient();
  const shortcutHint = useShortcutHint("mod+k");

  const knowledgeSpaces = useMemo(
    () => spaces.filter((item) => item.kind === "knowledge"),
    [spaces],
  );
  const projectSpaces = useMemo(
    () => spaces.filter((item) => item.kind === "project"),
    [spaces],
  );

  const [openSpaceIds, setOpenSpaceIds] = useState<Record<string, boolean>>({});
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [newSpaceKind, setNewSpaceKind] = useState<SpaceKind>("knowledge");
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");
  const [createSpaceError, setCreateSpaceError] = useState<string | null>(null);

  const isSpaceOpen = (spaceId: string): boolean => {
    if (spaceId in openSpaceIds) {
      return Boolean(openSpaceIds[spaceId]);
    }
    return spaceId === activeSpaceId || spaces[0]?.id === spaceId;
  };

  const createSpaceMutation = useMutation({
    mutationFn: createSpace,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.spaces() });
      setOpenSpaceIds((prev) => ({ ...prev, [created.id]: true }));
      setNewSpaceName("");
      setNewSpaceDesc("");
      setCreateSpaceError(null);
      setCreateSpaceOpen(false);
      onSpaceCreated?.(created);
      onSelectSpace(created.id);
      toast.success(`Created space "${created.name}"`);
    },
    onError: (err) => {
      setCreateSpaceError(err instanceof Error ? err.message : "Failed to create space");
    },
  });

  const createRootNodeMutation = useMutation({
    mutationFn: createNode,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(created.spaceId),
      });
      setOpenSpaceIds((prev) => ({ ...prev, [created.spaceId]: true }));
      onNodeCreated?.(created);
      onSelectView("workspace");
      onSelectNode(created.id, created.spaceId);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create asset");
    },
  });

  const openCreateSpaceDialog = (kind: SpaceKind) => {
    setNewSpaceKind(kind);
    setCreateSpaceError(null);
    setCreateSpaceOpen(true);
  };

  const handleCreateSpaceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateSpaceError(null);
    const trimmedName = newSpaceName.trim();
    if (!trimmedName) {
      setCreateSpaceError("Space name is required.");
      return;
    }
    createSpaceMutation.mutate({
      kind: newSpaceKind,
      name: trimmedName,
      description: newSpaceDesc.trim() || null,
    });
  };

  const renderSpaceGroup = (label: string, kind: SpaceKind, list: SpaceDto[]) => {
    const Icon = kind === "knowledge" ? BookOpen : FolderGit2;
    return (
      <div {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHeader)}>
          <span {...stylex.props(styles.sectionLabel)}>{label}</span>
          <button
            type="button"
            aria-label={`New ${label} space`}
            onClick={() => openCreateSpaceDialog(kind)}
            {...stylex.props(styles.sectionAddButton)}
          >
            <Plus size={13} />
          </button>
        </div>

        {list.length === 0 ? (
          <div {...stylex.props(styles.emptySpaces)}>No {label.toLowerCase()} spaces yet</div>
        ) : (
          list.map((spaceItem) => {
            const expanded = isSpaceOpen(spaceItem.id);
            const isActiveSpace = activeView === "workspace" && activeSpaceId === spaceItem.id;

            return (
              <Collapsible
                key={spaceItem.id}
                open={expanded}
                onOpenChange={(nextOpen) =>
                  setOpenSpaceIds((prev) => ({ ...prev, [spaceItem.id]: nextOpen }))
                }
              >
                <div
                  {...stylex.props(
                    styles.spaceRow,
                    isActiveSpace && styles.spaceRowActive,
                  )}
                >
                  <CollapsibleTrigger
                    onClick={() => {
                      onSelectView("workspace");
                      onSelectSpace(spaceItem.id);
                    }}
                    {...stylex.props(styles.spaceTrigger)}
                  >
                    <ChevronRight
                      size={13}
                      {...stylex.props(expanded && styles.chevronOpen)}
                    />
                    <Icon size={14} />
                    <span title={spaceItem.name} {...stylex.props(styles.spaceName)}>
                      {spaceItem.name}
                    </span>
                  </CollapsibleTrigger>

                  <Menu>
                    <MenuTrigger
                      aria-label={`New asset in ${spaceItem.name}`}
                      {...stylex.props(styles.sectionAddButton)}
                    >
                      <Plus size={13} />
                    </MenuTrigger>
                    <MenuContent align="end" sideOffset={4}>
                      <MenuGroupLabel>New in {spaceItem.name}</MenuGroupLabel>
                      {(["doc", "excalidraw", "html", "canvas"] as const).map((nodeType) => (
                        <MenuItem
                          key={nodeType}
                          value={`space-create:${spaceItem.id}:${nodeType}`}
                          onSelect={() =>
                            createRootNodeMutation.mutate({
                              spaceId: spaceItem.id,
                              parentId: null,
                              type: nodeType,
                              title: DEFAULT_TITLES[nodeType],
                            })
                          }
                        >
                          <MenuItemIcon>
                            {nodeType === "doc" ? (
                              <FileText size={13} />
                            ) : nodeType === "excalidraw" ? (
                              <PenTool size={13} />
                            ) : nodeType === "html" ? (
                              <Blocks size={13} />
                            ) : (
                              <Network size={13} />
                            )}
                          </MenuItemIcon>
                          <span>
                            {nodeType === "doc"
                              ? "Markdown Page"
                              : nodeType === "excalidraw"
                                ? "Excalidraw Whiteboard"
                                : nodeType === "html"
                                  ? "HTML Artifact"
                                  : "Infinite Canvas"}
                          </span>
                        </MenuItem>
                      ))}
                    </MenuContent>
                  </Menu>
                </div>

                <CollapsiblePanel {...stylex.props(styles.spaceTreeWrap)}>
                  <NodeTree
                    spaceId={spaceItem.id}
                    selectedNodeId={activeView === "workspace" ? selectedNodeId : null}
                    onSelectNode={(nodeId, nodeSpaceId) => {
                      onSelectView("workspace");
                      onSelectSpace(nodeSpaceId);
                      onSelectNode(nodeId, nodeSpaceId);
                    }}
                    onNodeCreated={onNodeCreated}
                    onNodeDeleted={onNodeDeleted}
                  />
                </CollapsiblePanel>
              </Collapsible>
            );
          })
        )}
      </div>
    );
  };

  return (
    <aside data-slot="merak-sidebar" {...stylex.props(styles.sidebar)}>
      <div {...stylex.props(styles.topSection)}>
        <TeamSwitcher
          onOrganizationChanged={onOrganizationChanged}
          onSignedOut={onSignedOut}
        />

        {onOpenCommandPalette ? (
          <button
            type="button"
            aria-label="Open command palette"
            aria-keyshortcuts={shortcutHint.ariaKeyshortcuts}
            onClick={onOpenCommandPalette}
            {...stylex.props(styles.searchButton)}
          >
            <Inline gap="xs">
              <Search size={14} />
              <span>Search workspace...</span>
            </Inline>
            <span {...stylex.props(styles.searchHint)}>{shortcutHint.text}</span>
          </button>
        ) : null}
      </div>

      <ScrollArea {...stylex.props(styles.scrollRoot)}>
        <ScrollAreaViewport {...stylex.props(styles.scrollViewport)}>
          <ScrollAreaContent {...stylex.props(styles.scrollContent)}>
            {renderSpaceGroup("Knowledge Base", "knowledge", knowledgeSpaces)}
            <Separator />
            {renderSpaceGroup("Projects", "project", projectSpaces)}
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollArea>

      <nav aria-label="Workspace utilities" {...stylex.props(styles.bottomNav)}>
        <button
          type="button"
          onClick={() => onSelectView("gallery")}
          {...stylex.props(
            styles.navButton,
            activeView === "gallery" && styles.navButtonActive,
          )}
        >
          <ImageIcon size={15} />
          <span>Media Gallery</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectView("mcp-tokens")}
          {...stylex.props(
            styles.navButton,
            activeView === "mcp-tokens" && styles.navButtonActive,
          )}
        >
          <KeyRound size={15} />
          <span>MCP Tokens</span>
        </button>
      </nav>

      <Dialog open={createSpaceOpen} onOpenChange={(nextOpen) => setCreateSpaceOpen(nextOpen)}>
        <DialogBackdrop />
        <DialogContent {...stylex.props(styles.dialogContent)}>
          <DialogTitle>Create Space</DialogTitle>
          <DialogDescription>
            Organize long-lived docs in a Knowledge Base or time-bounded deliverables in a Project.
          </DialogDescription>

          <form onSubmit={handleCreateSpaceSubmit} {...stylex.props(styles.form)} noValidate>
            <Stack gap="md">
              <Field name="space-kind">
                <FieldLabel>Space Kind</FieldLabel>
                <SegmentedControl<SpaceKind>
                  value={newSpaceKind}
                  onValueChange={(next) => {
                    if (next === "knowledge" || next === "project") {
                      setNewSpaceKind(next);
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="knowledge">Knowledge Base</SegmentedControlItem>
                  <SegmentedControlItem value="project">Project</SegmentedControlItem>
                </SegmentedControl>
              </Field>

              <Field name="space-name">
                <FieldLabel>Space Name</FieldLabel>
                <Input
                  placeholder={newSpaceKind === "knowledge" ? "Engineering Wiki" : "Q3 Launch"}
                  value={newSpaceName}
                  onValueChange={(val) => setNewSpaceName(val)}
                  autoFocus
                  required
                />
              </Field>

              <Field name="space-description">
                <FieldLabel>Description (optional)</FieldLabel>
                <Textarea
                  placeholder="Short summary of what lives in this space..."
                  value={newSpaceDesc}
                  onValueChange={(val) => setNewSpaceDesc(val)}
                  rows={2}
                />
              </Field>

              {createSpaceError ? (
                <div role="alert" {...stylex.props(styles.errorBanner)}>
                  {createSpaceError}
                </div>
              ) : null}

              <Inline justify="end" gap="sm">
                <DialogClose disabled={createSpaceMutation.isPending}>Cancel</DialogClose>
                <Button
                  type="submit"
                  data-variant="solid"
                  disabled={createSpaceMutation.isPending}
                >
                  {createSpaceMutation.isPending ? "Creating..." : "Create Space"}
                </Button>
              </Inline>
            </Stack>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
