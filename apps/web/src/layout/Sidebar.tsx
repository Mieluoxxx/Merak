import type { NodeDetailDto, NodeType, SpaceDto, SpaceVisibility } from "@merak/shared";
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
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
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
  ChevronRight,
  FileText,
  Folder,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Lock,
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
  updateSpace,
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
  folder: "Untitled Folder",
};

const styles = stylex.create({
  sidebar: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    backgroundColor: colors.bgSubtle,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: colors.borderSubtle,
    color: colors.text,
  },
  topSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    paddingTop: "10px",
    paddingBottom: "4px",
    paddingInline: "10px",
    borderBottomWidth: 0,
    borderBottomStyle: "none",
  },
  searchButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    width: "100%",
    height: "30px",
    paddingBlock: 0,
    paddingInline: "8px",
    borderRadius: "7px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    backgroundColor: {
      default: colors.bgHover,
      ":hover": colors.bgActive,
    },
    color: colors.textSubtle,
    fontSize: "12.5px",
    cursor: "pointer",
    transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease",
  },
  searchHint: {
    paddingBlock: "1px",
    paddingInline: "5px",
    borderRadius: radius.sm,
    backgroundColor: colors.bgSubtle,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontFamily: font.mono,
    fontSize: "10.5px",
    lineHeight: 1.3,
    color: colors.textSubtle,
  },
  scrollRoot: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 0,
  },
  scrollViewport: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
  },
  scrollContent: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    paddingBlock: "12px",
    paddingInline: "10px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    height: "24px",
    paddingInline: "8px",
    marginBottom: "2px",
  },
  sectionLabel: {
    fontSize: "12px",
    fontWeight: 500,
    color: colors.textSubtle,
  },
  sectionAddButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: radius.sm,
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: {
      default: colors.textSubtle,
      ":hover": colors.text,
    },
    cursor: "pointer",
    padding: 0,
    transition: "background-color 150ms ease, color 150ms ease",
  },
  spaceRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    minHeight: "30px",
    borderRadius: "7px",
    paddingBlock: "3px",
    paddingInline: "8px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    transition: "background-color 150ms ease",
  },
  spaceRowActive: {
    backgroundColor: {
      default: colors.bgActive,
      ":hover": colors.bgActive,
    },
  },
  spaceTrigger: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: 0,
    minHeight: "24px",
    height: "auto",
    flex: "1 1 auto",
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: "transparent",
    color: colors.text,
    fontSize: font.sizeSm,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
    padding: 0,
  },
  spaceIcon: {
    color: colors.textMuted,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
  },
  spaceIconActive: {
    color: colors.text,
  },
  spaceName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chevron: {
    color: colors.textSubtle,
    flexShrink: 0,
    transition: "transform 150ms ease",
  },
  chevronOpen: {
    transform: "rotate(90deg)",
  },
  spaceTreeWrap: {
    paddingLeft: "6px",
    paddingTop: "2px",
  },
  emptySpaces: {
    paddingInline: "8px",
    paddingBlock: "4px",
    fontSize: font.sizeXs,
    color: colors.textSubtle,
  },
  bottomSwitcher: {
    paddingBlock: "6px",
    paddingInline: "8px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
  navButton: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    width: "100%",
    height: "30px",
    paddingBlock: 0,
    paddingInline: "8px",
    borderRadius: "7px",
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
    },
    fontSize: font.sizeSm,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
    transition: "background-color 150ms ease, color 150ms ease",
  },
  navButtonActive: {
    backgroundColor: {
      default: colors.bgActive,
      ":hover": colors.bgActive,
    },
    color: colors.text,
  },
  dialogContent: {
    width: "100%",
    maxWidth: "440px",
  },
  dialogFooter: {
    marginTop: "4px",
    paddingTop: "14px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
    gap: "10px",
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
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.danger,
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

  const sharedSpaces = useMemo(
    () => spaces.filter((item) => item.visibility === "shared"),
    [spaces],
  );
  const privateSpaces = useMemo(
    () => spaces.filter((item) => item.visibility === "private"),
    [spaces],
  );

  const [openSpaceIds, setOpenSpaceIds] = useState<Record<string, boolean>>({});
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [newSpaceVisibility, setNewSpaceVisibility] = useState<SpaceVisibility>("private");
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
      toast.success(`Created project "${created.name}"`);
    },
    onError: (err) => {
      setCreateSpaceError(err instanceof Error ? err.message : "Failed to create project");
    },
  });

  const updateSpaceVisibilityMutation = useMutation({
    mutationFn: ({ spaceId, visibility }: { spaceId: string; visibility: SpaceVisibility }) =>
      updateSpace(spaceId, { visibility }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.spaces() });
      toast.success(
        `Moved "${updated.name}" to ${updated.visibility === "shared" ? "Shared" : "Private"}`,
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to move project");
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

  const openCreateSpaceDialog = (visibility: SpaceVisibility) => {
    setNewSpaceVisibility(visibility);
    setCreateSpaceError(null);
    setCreateSpaceOpen(true);
  };

  const handleCreateSpaceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateSpaceError(null);
    const trimmedName = newSpaceName.trim();
    if (!trimmedName) {
      setCreateSpaceError("Project name is required.");
      return;
    }
    createSpaceMutation.mutate({
      visibility: newSpaceVisibility,
      name: trimmedName,
      description: newSpaceDesc.trim() || null,
    });
  };

  const renderSpaceGroup = (label: string, visibility: SpaceVisibility, list: SpaceDto[]) => {
    const Icon = visibility === "shared" ? Globe : Lock;
    return (
      <div {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHeader)}>
          <span {...stylex.props(styles.sectionLabel)}>{label}</span>
          <button
            type="button"
            aria-label={`New ${label.toLowerCase()} project`}
            onClick={() => openCreateSpaceDialog(visibility)}
            {...stylex.props(styles.sectionAddButton)}
          >
            <Plus size={13} />
          </button>
        </div>

        {list.length === 0 ? (
          <div {...stylex.props(styles.emptySpaces)}>
            {visibility === "shared" ? "No shared projects yet" : "No private projects yet"}
          </div>
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
                      {...stylex.props(styles.chevron, expanded && styles.chevronOpen)}
                    />
                    <span
                      {...stylex.props(
                        styles.spaceIcon,
                        isActiveSpace && styles.spaceIconActive,
                      )}
                    >
                      <Icon size={14} />
                    </span>
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
                      <MenuGroup>
                        <MenuGroupLabel>New in {spaceItem.name}</MenuGroupLabel>
                        {(["folder", "doc", "excalidraw", "html", "canvas"] as const).map((nodeType) => (
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
                              {nodeType === "folder" ? (
                                <Folder size={13} />
                              ) : nodeType === "doc" ? (
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
                              {nodeType === "folder"
                                ? "Folder"
                                : nodeType === "doc"
                                  ? "Markdown Page"
                                  : nodeType === "excalidraw"
                                    ? "Excalidraw Whiteboard"
                                    : nodeType === "html"
                                      ? "HTML Artifact"
                                      : "Infinite Canvas"}
                            </span>
                          </MenuItem>
                        ))}
                      </MenuGroup>
                      <MenuSeparator />
                      <MenuItem
                        value={`space-visibility:${spaceItem.id}`}
                        onSelect={() =>
                          updateSpaceVisibilityMutation.mutate({
                            spaceId: spaceItem.id,
                            visibility: spaceItem.visibility === "shared" ? "private" : "shared",
                          })
                        }
                      >
                        <MenuItemIcon>
                          {spaceItem.visibility === "shared" ? (
                            <Lock size={13} />
                          ) : (
                            <Globe size={13} />
                          )}
                        </MenuItemIcon>
                        <span>
                          {spaceItem.visibility === "shared"
                            ? "Move to Private"
                            : "Move to Shared"}
                        </span>
                      </MenuItem>
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
      {onOpenCommandPalette ? (
        <div {...stylex.props(styles.topSection)}>
          <button
            type="button"
            aria-label="Open command palette"
            aria-keyshortcuts={shortcutHint.ariaKeyshortcuts}
            onClick={onOpenCommandPalette}
            {...stylex.props(styles.searchButton)}
          >
            <Inline gap="xs">
              <Search size={13.5} />
              <span>Search workspace...</span>
            </Inline>
            <span {...stylex.props(styles.searchHint)}>{shortcutHint.text}</span>
          </button>
        </div>
      ) : null}

      <ScrollArea {...stylex.props(styles.scrollRoot)}>
        <ScrollAreaViewport {...stylex.props(styles.scrollViewport)}>
          <ScrollAreaContent {...stylex.props(styles.scrollContent)}>
            {renderSpaceGroup("Shared", "shared", sharedSpaces)}
            {renderSpaceGroup("Private", "private", privateSpaces)}

            <nav aria-label="Workspace utilities" {...stylex.props(styles.section)}>
              <div {...stylex.props(styles.sectionHeader)}>
                <span {...stylex.props(styles.sectionLabel)}>Workspace</span>
              </div>

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
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical">
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollArea>

      <div {...stylex.props(styles.bottomSwitcher)}>
        <TeamSwitcher
          onOrganizationChanged={onOrganizationChanged}
          onSignedOut={onSignedOut}
        />
      </div>

      <Dialog open={createSpaceOpen} onOpenChange={(nextOpen) => setCreateSpaceOpen(nextOpen)}>
        <DialogBackdrop />
        <DialogContent {...stylex.props(styles.dialogContent)}>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Keep personal notes in Private or collaborate with teammates in a Shared project.
          </DialogDescription>

          <form onSubmit={handleCreateSpaceSubmit} {...stylex.props(styles.form)} noValidate>
            <Stack gap="md">
              <Field name="space-visibility">
                <FieldLabel>Visibility</FieldLabel>
                <SegmentedControl<SpaceVisibility>
                  value={newSpaceVisibility}
                  onValueChange={(next) => {
                    if (next === "shared" || next === "private") {
                      setNewSpaceVisibility(next);
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="shared">Shared</SegmentedControlItem>
                  <SegmentedControlItem value="private">Private</SegmentedControlItem>
                </SegmentedControl>
              </Field>

              <Field name="space-name">
                <FieldLabel>Project Name</FieldLabel>
                <Input
                  placeholder={newSpaceVisibility === "shared" ? "Engineering Wiki" : "Personal Notes"}
                  value={newSpaceName}
                  onValueChange={(val) => setNewSpaceName(val)}
                  autoFocus
                  required
                />
              </Field>

              <Field name="space-description">
                <FieldLabel>Description (optional)</FieldLabel>
                <Textarea
                  placeholder="Short summary of what lives in this project..."
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

              <Inline justify="end" gap="sm" xstyle={styles.dialogFooter}>
                <DialogClose disabled={createSpaceMutation.isPending}>Cancel</DialogClose>
                <Button
                  type="submit"
                  data-variant="solid"
                  disabled={createSpaceMutation.isPending}
                >
                  {createSpaceMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </Inline>
            </Stack>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
