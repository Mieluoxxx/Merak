import type { NodeDetailDto, NodeType, SpaceDto } from "@merak/shared";
import {
  Badge,
  Button,
  Inline,
  ThemeScope,
  ToastRegion,
  useShortcutHint,
  type ThemeMode,
} from "@merak/ui";
import { colors, font, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Sparkles, SunMoon, Wifi, WifiOff } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  useMerakAgentBridge,
  type WorkbenchView,
} from "../features/agent/bridge.js";
import {
  createNode,
  fetchSpaces,
  workspaceQueryKeys,
} from "../features/api/workspace-api.js";
import { McpTokensPanel } from "../features/auth/McpTokensPanel.js";
import { MediaGalleryView } from "../features/gallery/MediaGalleryView.js";
import { CommandPalette } from "../features/search/CommandPalette.js";
import {
  useWorkspaceRealtime,
  type EditingSessionContext,
} from "../lib/ws.js";
import { Sidebar } from "./Sidebar.js";
import { StaleConflictBanner } from "./StaleConflictBanner.js";

export interface WorkbenchLayoutProps {
  /** Optional externally managed spaces; fetched automatically if omitted. */
  spaces?: SpaceDto[];
  /** Controlled or uncontrolled view state. */
  activeView?: WorkbenchView;
  onActiveViewChange?: (view: WorkbenchView) => void;
  /** Controlled or uncontrolled active space ID. */
  activeSpaceId?: string | null;
  onActiveSpaceChange?: (spaceId: string | null) => void;
  /** Controlled or uncontrolled selected node ID. */
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string, spaceId?: string) => void;
  /** Controlled or uncontrolled theme mode. */
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  /** Active editing state forwarded into realtime conflict detection. */
  editingContext?: EditingSessionContext;
  onReloadRemoteNode?: (nodeId: string) => void | Promise<void>;
  /** Enable or disable WebSocket live sync & agent bridge. */
  realtimeEnabled?: boolean;
  agentBridgeEnabled?: boolean;
  /** Header title & optional right-hand actions slot. */
  headerTitle?: ReactNode;
  headerActions?: ReactNode;
  /** Optional custom sidebar replacement. */
  sidebar?: ReactNode;
  /** Workspace editor/main content slot when `activeView === "workspace"`. */
  children?: ReactNode;
  /** Callbacks for lifecycle events. */
  onNodeCreated?: (node: NodeDetailDto) => void;
  onNodeDeleted?: (nodeId: string, spaceId: string) => void;
  onOrganizationChanged?: (organizationId: string) => void;
  onSignedOut?: () => void;
}

const styles = stylex.create({
  shell: {
    display: "grid",
    gridTemplateColumns: "272px 1fr",
    height: "100%",
    width: "100%",
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
    overflow: "hidden",
  },
  contentColumn: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  headerTitleGroup: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minWidth: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: font.sizeMd,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  main: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    padding: space.xl,
    display: "flex",
    flexDirection: "column",
  },
});

const DEFAULT_TITLES: Record<NodeType, string> = {
  doc: "Untitled Page",
  excalidraw: "Untitled Whiteboard",
  html: "Untitled HTML Artifact",
  canvas: "Untitled Canvas",
};

export function WorkbenchLayout({
  spaces: providedSpaces,
  activeView: controlledView,
  onActiveViewChange,
  activeSpaceId: controlledSpaceId,
  onActiveSpaceChange,
  selectedNodeId: controlledNodeId,
  onSelectNode,
  theme: controlledTheme,
  onThemeChange,
  editingContext,
  onReloadRemoteNode,
  realtimeEnabled = true,
  agentBridgeEnabled = true,
  headerTitle,
  headerActions,
  sidebar,
  children,
  onNodeCreated,
  onNodeDeleted,
  onOrganizationChanged,
  onSignedOut,
}: WorkbenchLayoutProps) {
  const queryClient = useQueryClient();
  const shortcutHint = useShortcutHint("mod+k");

  const [uncontrolledView, setUncontrolledView] = useState<WorkbenchView>("workspace");
  const [uncontrolledSpaceId, setUncontrolledSpaceId] = useState<string | null>(null);
  const [uncontrolledNodeId, setUncontrolledNodeId] = useState<string | null>(null);
  const [uncontrolledTheme, setUncontrolledTheme] = useState<ThemeMode>("system");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandInitialQuery, setCommandInitialQuery] = useState("");

  const activeView = controlledView ?? uncontrolledView;
  const theme = controlledTheme ?? uncontrolledTheme;

  const spacesQuery = useQuery({
    queryKey: workspaceQueryKeys.spaces(),
    queryFn: () => fetchSpaces(),
    enabled: providedSpaces === undefined,
  });

  const spaces = providedSpaces ?? spacesQuery.data ?? [];
  const activeSpaceId = controlledSpaceId ?? uncontrolledSpaceId ?? spaces[0]?.id ?? null;
  const selectedNodeId = controlledNodeId ?? uncontrolledNodeId;

  const setView = useCallback(
    (next: WorkbenchView) => {
      if (controlledView === undefined) {
        setUncontrolledView(next);
      }
      onActiveViewChange?.(next);
    },
    [controlledView, onActiveViewChange],
  );

  const setSpaceId = useCallback(
    (next: string | null) => {
      if (controlledSpaceId === undefined) {
        setUncontrolledSpaceId(next);
      }
      onActiveSpaceChange?.(next);
    },
    [controlledSpaceId, onActiveSpaceChange],
  );

  const selectNode = useCallback(
    (nodeId: string, spaceId?: string) => {
      setView("workspace");
      if (spaceId) {
        setSpaceId(spaceId);
      }
      if (controlledNodeId === undefined) {
        setUncontrolledNodeId(nodeId);
      }
      onSelectNode?.(nodeId, spaceId);
    },
    [controlledNodeId, onSelectNode, setSpaceId, setView],
  );

  const cycleTheme = useCallback(() => {
    const next: ThemeMode =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    if (controlledTheme === undefined) {
      setUncontrolledTheme(next);
    }
    onThemeChange?.(next);
  }, [controlledTheme, onThemeChange, theme]);

  const subscribedSpaceIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeSpaceId) ids.add(activeSpaceId);
    for (const s of spaces) {
      ids.add(s.id);
    }
    return [...ids];
  }, [activeSpaceId, spaces]);

  const realtime = useWorkspaceRealtime({
    spaceIds: subscribedSpaceIds,
    enabled: realtimeEnabled && subscribedSpaceIds.length > 0,
    editingNodeId: editingContext?.editingNodeId ?? selectedNodeId,
    localVersion: editingContext?.localVersion ?? null,
    isDirty: editingContext?.isDirty ?? false,
    currentUserId: editingContext?.currentUserId ?? null,
    onReloadNode: onReloadRemoteNode,
  });

  const createQuickNodeMutation = useMutation({
    mutationFn: createNode,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(created.spaceId),
      });
      onNodeCreated?.(created);
      selectNode(created.id, created.spaceId);
    },
  });

  useMerakAgentBridge(
    {
      getState: () => ({
        activeView,
        activeSpaceId,
        activeNodeId: selectedNodeId,
        theme,
        commandPaletteOpen: commandOpen,
        realtimeState: realtime.connectionState,
        hasConflict: realtime.conflictEvent !== null,
        spaces: spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      }),
      navigateNode: (nodeId, spaceId) => selectNode(nodeId, spaceId),
      switchSpace: (spaceId) => {
        setView("workspace");
        setSpaceId(spaceId);
      },
      openCommandPalette: (opts) => {
        if (opts?.query !== undefined) {
          setCommandInitialQuery(opts.query);
        }
        setCommandOpen(opts?.open ?? true);
      },
      openView: (view) => setView(view),
    },
    { enabled: agentBridgeEnabled },
  );

  const activeSpace = useMemo(
    () => spaces.find((s) => s.id === activeSpaceId) ?? null,
    [activeSpaceId, spaces],
  );

  const resolvedHeaderTitle =
    headerTitle ??
    (activeView === "gallery"
      ? "Media Gallery"
      : activeView === "mcp-tokens"
        ? "MCP Agent Tokens"
        : (activeSpace?.name ?? "Merak Workspace"));

  return (
    <ThemeScope theme={theme}>
      <div data-slot="merak-workbench-shell" {...stylex.props(styles.shell)}>
        {sidebar ?? (
          <Sidebar
            spaces={spaces}
            activeView={activeView}
            activeSpaceId={activeSpaceId}
            selectedNodeId={selectedNodeId}
            onSelectView={setView}
            onSelectSpace={(spaceId) => setSpaceId(spaceId)}
            onSelectNode={(nodeId, spaceId) => selectNode(nodeId, spaceId)}
            onOpenCommandPalette={() => {
              setCommandInitialQuery("");
              setCommandOpen(true);
            }}
            onNodeCreated={onNodeCreated}
            onNodeDeleted={(nodeId, spaceId) => {
              if (selectedNodeId === nodeId && controlledNodeId === undefined) {
                setUncontrolledNodeId(null);
              }
              onNodeDeleted?.(nodeId, spaceId);
            }}
            onOrganizationChanged={onOrganizationChanged}
            onSignedOut={onSignedOut}
          />
        )}

        <div {...stylex.props(styles.contentColumn)}>
          <header {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.headerTitleGroup)}>
              <Sparkles size={16} />
              <h2 {...stylex.props(styles.headerTitle)}>{resolvedHeaderTitle}</h2>
            </div>

            <Inline gap="xs">
              {headerActions}

              <Button
                aria-label="Open command palette"
                aria-keyshortcuts={shortcutHint.ariaKeyshortcuts}
                onClick={() => {
                  setCommandInitialQuery("");
                  setCommandOpen(true);
                }}
              >
                <Search size={14} />
                <span>{shortcutHint.text}</span>
              </Button>

              {realtimeEnabled ? (
                <Badge
                  tone={
                    realtime.connectionState === "open"
                      ? "success"
                      : realtime.connectionState === "reconnecting"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {realtime.connectionState === "open" ? (
                    <Wifi size={12} />
                  ) : (
                    <WifiOff size={12} />
                  )}
                  <span>
                    {realtime.connectionState === "open"
                      ? "Live"
                      : realtime.connectionState === "reconnecting"
                        ? "Reconnecting"
                        : "Offline"}
                  </span>
                </Badge>
              ) : null}

              <Button aria-label={`Theme: ${theme}`} onClick={cycleTheme}>
                <SunMoon size={14} />
                <span>{theme}</span>
              </Button>
            </Inline>
          </header>

          <StaleConflictBanner
            conflict={realtime.conflictEvent}
            onReloadRemote={() => realtime.reloadRemote()}
            onDismiss={realtime.dismissConflict}
          />

          <main {...stylex.props(styles.main)}>
            {activeView === "gallery" ? (
              <MediaGalleryView
                spaces={spaces}
                defaultSpaceId={activeSpaceId}
                onOpenNode={(nodeId) => selectNode(nodeId)}
              />
            ) : activeView === "mcp-tokens" ? (
              <McpTokensPanel spaces={spaces} />
            ) : (
              children
            )}
          </main>
        </div>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={(nextOpen) => {
          setCommandOpen(nextOpen);
          if (!nextOpen) setCommandInitialQuery("");
        }}
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        initialQuery={commandInitialQuery}
        onSelectNode={(nodeId, spaceId) => selectNode(nodeId, spaceId)}
        onOpenGallery={() => setView("gallery")}
        onOpenMcpTokens={() => setView("mcp-tokens")}
        onCreateNode={(type, spaceId) => {
          createQuickNodeMutation.mutate({
            spaceId,
            parentId: null,
            type,
            title: DEFAULT_TITLES[type],
          });
        }}
        onCycleTheme={cycleTheme}
      />

      <ToastRegion />
    </ThemeScope>
  );
}

export { WorkbenchLayout as WorkbenchShell };
