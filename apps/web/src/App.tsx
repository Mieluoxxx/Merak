import type { NodeDetailDto, NodeType } from "@merak/shared";
import {
  Button,
  EmptyState,
  Inline,
  Input,
  ThemeScope,
  toast,
  type ThemeMode,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Blocks, FileText, Folder, Network, PenTool, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AssetEditorRouter } from "./editors/index.js";
import { type WorkbenchView } from "./features/agent/bridge.js";
import {
  createNodeSaveQueue,
  type NodePatchPayload,
  type NodeSaveQueue,
} from "./features/api/autoSaveQueue.js";
import {
  createNode,
  fetchNode,
  fetchSpaces,
  updateNode,
  uploadMediaFile,
  workspaceQueryKeys,
} from "./features/api/workspace-api.js";
import { AuthScreen } from "./features/auth/index.js";
import { WorkbenchLayout } from "./layout/WorkbenchLayout.js";
import { useSession } from "./lib/auth-client.js";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEFAULT_TITLES: Record<NodeType, string> = {
  doc: "Untitled Page",
  excalidraw: "Untitled Whiteboard",
  html: "Untitled HTML Artifact",
  canvas: "Untitled Canvas",
  folder: "Untitled Folder",
};

const styles = stylex.create({
  loadingScreen: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
    backgroundColor: colors.bg,
    color: colors.textMuted,
    fontFamily: font.sans,
    fontSize: font.sizeSm,
  },
  titleInput: {
    minWidth: "180px",
    maxWidth: "360px",
    height: "28px",
    paddingInline: space.sm,
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "solid",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
      ":focus": colors.bgElevated,
    },
    borderColor: {
      default: "transparent",
      ":focus": colors.border,
    },
    fontSize: font.sizeMd,
    fontWeight: 600,
    color: colors.text,
  },
  emptyActionBtn: {
    height: "34px",
    paddingInline: "14px",
    borderRadius: radius.md,
    fontSize: font.sizeSm,
  },
  editorContainer: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  saveStatusText: {
    fontSize: font.sizeXs,
    fontWeight: 500,
    color: colors.textMuted,
    userSelect: "none",
  },
  saveStatusError: {
    fontSize: font.sizeXs,
    fontWeight: 500,
    color: colors.danger,
    userSelect: "none",
  },
});

function useResolvedTheme(themeMode: ThemeMode): "light" | "dark" {
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (themeMode === "light") return "light";
  if (themeMode === "dark") return "dark";
  return systemDark ? "dark" : "light";
}

export function App() {
  const queryClient = useQueryClient();
  const session = useSession();

  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const resolvedTheme = useResolvedTheme(themeMode);

  const [activeView, setActiveView] = useState<WorkbenchView>("workspace");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [draft, setDraft] = useState<{ nodeId: string; content: string; title: string } | null>(
    null,
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stagedPatchRef = useRef<Map<string, NodePatchPayload>>(new Map());
  const activeNodeRef = useRef<NodeDetailDto | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const isAuthenticated = Boolean(session.data?.user);

  const spacesQuery = useQuery({
    queryKey: workspaceQueryKeys.spaces(),
    queryFn: () => fetchSpaces(),
    enabled: isAuthenticated,
  });

  const spaces = spacesQuery.data ?? [];
  const effectiveSpaceId = useMemo(() => {
    if (activeSpaceId && spaces.some((s) => s.id === activeSpaceId)) {
      return activeSpaceId;
    }
    return spaces[0]?.id ?? null;
  }, [activeSpaceId, spaces]);

  const nodeQuery = useQuery({
    queryKey: workspaceQueryKeys.node(selectedNodeId ?? "__none__"),
    queryFn: () => fetchNode(selectedNodeId!),
    enabled: isAuthenticated && Boolean(selectedNodeId),
  });

  const activeNode = selectedNodeId ? (nodeQuery.data ?? null) : null;
  activeNodeRef.current = activeNode;

  const effectiveDraftContent =
    activeNode && draft?.nodeId === activeNode.id ? draft.content : (activeNode?.content ?? "");
  const effectiveDraftTitle =
    activeNode && draft?.nodeId === activeNode.id ? draft.title : (activeNode?.title ?? "");

  const saveQueue = useMemo<NodeSaveQueue>(
    () =>
      createNodeSaveQueue({
        getExpectedVersion: (nodeId) => {
          const target = activeNodeRef.current;
          if (target?.id === nodeId) {
            return target.version;
          }
          return queryClient.getQueryData<NodeDetailDto>(workspaceQueryKeys.node(nodeId))?.version;
        },
        sendPatch: (nodeId, payload, options) => {
          void queryClient.cancelQueries({ queryKey: workspaceQueryKeys.node(nodeId) });
          return updateNode(nodeId, payload, options);
        },
        onSaved: (nodeId, updated, sent) => {
          queryClient.setQueryData(workspaceQueryKeys.node(nodeId), updated);
          if (activeNodeRef.current?.id === nodeId) {
            activeNodeRef.current = updated;
          }
          if (sent.title !== undefined) {
            void queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.tree(updated.spaceId),
            });
          }
        },
        onError: (nodeId, err) => {
          if (activeNodeRef.current?.id === nodeId) {
            setSaveStatus("error");
          }
          toast.error(err instanceof Error ? err.message : "Failed to save changes");
        },
        onStateChange: (nodeId, state) => {
          if (activeNodeRef.current?.id !== nodeId) return;
          if (state.inFlight || state.hasQueued) {
            setSaveStatus("saving");
            return;
          }
          if (!stagedPatchRef.current.has(nodeId)) {
            if (state.lastOutcome === "error") {
              setSaveStatus("error");
            } else if (state.lastOutcome === "saved") {
              setIsDirty(false);
              setSaveStatus("saved");
            }
          }
        },
      }),
    [queryClient],
  );

  // Sync draft state when switching nodes or when a background reload updates a clean node.
  useEffect(() => {
    if (contentTimerRef.current) {
      clearTimeout(contentTimerRef.current);
      contentTimerRef.current = null;
    }
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    if (!activeNode) {
      setDraft(null);
      setIsDirty(false);
      setSaveStatus("idle");
      return;
    }
    setDraft({ nodeId: activeNode.id, content: activeNode.content, title: activeNode.title });
    const hasPending = stagedPatchRef.current.has(activeNode.id) || saveQueue.isBusy(activeNode.id);
    setIsDirty(hasPending);
    setSaveStatus(saveQueue.isBusy(activeNode.id) ? "saving" : "idle");
  }, [activeNode?.id, saveQueue]);

  useEffect(() => {
    if (!activeNode || isDirty || saveQueue.isBusy(activeNode.id)) return;
    if (stagedPatchRef.current.has(activeNode.id)) return;
    setDraft({ nodeId: activeNode.id, content: activeNode.content, title: activeNode.title });
  }, [activeNode?.version, activeNode?.content, activeNode?.title, isDirty, saveQueue]);

  const flushPendingSave = useCallback(
    (options?: { keepalive?: boolean }) => {
      if (contentTimerRef.current) {
        clearTimeout(contentTimerRef.current);
        contentTimerRef.current = null;
      }
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
        titleTimerRef.current = null;
      }
      if (stagedPatchRef.current.size > 0) {
        const entries = Array.from(stagedPatchRef.current.entries());
        stagedPatchRef.current.clear();
        for (const [nodeId, patch] of entries) {
          void saveQueue.enqueue(nodeId, patch, options);
        }
      }
      if (options?.keepalive) {
        void saveQueue.flush(undefined, { keepalive: true });
      }
    },
    [saveQueue],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave({ keepalive: true });
      }
    };
    const handlePageHide = () => {
      flushPendingSave({ keepalive: true });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const handleContentChange = useCallback(
    (nextContent: string) => {
      const target = activeNodeRef.current;
      if (!target) return;
      const nodeId = target.id;

      setDraft((prev) => ({
        nodeId,
        content: nextContent,
        title: prev?.nodeId === nodeId ? prev.title : target.title,
      }));
      setIsDirty(true);
      setSaveStatus("idle");

      const prevStaged = stagedPatchRef.current.get(nodeId) ?? {};
      stagedPatchRef.current.set(nodeId, { ...prevStaged, content: nextContent });

      if (contentTimerRef.current) {
        clearTimeout(contentTimerRef.current);
      }
      contentTimerRef.current = setTimeout(() => {
        contentTimerRef.current = null;
        const staged = stagedPatchRef.current.get(nodeId);
        if (staged) {
          const { content, ...rest } = staged;
          if (rest.title !== undefined) {
            stagedPatchRef.current.set(nodeId, rest);
          } else {
            stagedPatchRef.current.delete(nodeId);
          }
          if (content !== undefined) {
            void saveQueue.enqueue(nodeId, { content });
          }
        }
      }, 600);
    },
    [saveQueue],
  );

  const handleImmediateSave = useCallback(
    async (nextContent: string) => {
      const target = activeNodeRef.current;
      if (!target) return;
      const nodeId = target.id;
      if (contentTimerRef.current) {
        clearTimeout(contentTimerRef.current);
        contentTimerRef.current = null;
      }
      const staged = stagedPatchRef.current.get(nodeId);
      if (staged) {
        const { content: _drop, ...rest } = staged;
        if (rest.title !== undefined) {
          stagedPatchRef.current.set(nodeId, rest);
        } else {
          stagedPatchRef.current.delete(nodeId);
        }
      }
      setDraft((prev) => ({
        nodeId,
        content: nextContent,
        title: prev?.nodeId === nodeId ? prev.title : target.title,
      }));
      setSaveStatus("saving");
      await saveQueue.enqueue(nodeId, { content: nextContent });
    },
    [saveQueue],
  );

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      const target = activeNodeRef.current;
      if (!target) return;
      const nodeId = target.id;

      setDraft((prev) => ({
        nodeId,
        content: prev?.nodeId === nodeId ? prev.content : target.content,
        title: nextTitle,
      }));

      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
        titleTimerRef.current = null;
      }

      const trimmed = nextTitle.trim();
      const prevStaged = stagedPatchRef.current.get(nodeId);
      if (!trimmed || trimmed === target.title) {
        if (prevStaged) {
          const { title: _drop, ...rest } = prevStaged;
          if (rest.content !== undefined) {
            stagedPatchRef.current.set(nodeId, rest);
          } else {
            stagedPatchRef.current.delete(nodeId);
          }
        }
        if (!stagedPatchRef.current.has(nodeId) && !saveQueue.isBusy(nodeId)) {
          const currentDraftContent =
            draftRef.current?.nodeId === nodeId ? draftRef.current.content : target.content;
          if (currentDraftContent === target.content) {
            setIsDirty(false);
          }
        }
        return;
      }

      setIsDirty(true);
      setSaveStatus("idle");
      stagedPatchRef.current.set(nodeId, { ...prevStaged, title: trimmed });

      titleTimerRef.current = setTimeout(() => {
        titleTimerRef.current = null;
        const staged = stagedPatchRef.current.get(nodeId);
        if (staged) {
          const { title, ...rest } = staged;
          if (rest.content !== undefined) {
            stagedPatchRef.current.set(nodeId, rest);
          } else {
            stagedPatchRef.current.delete(nodeId);
          }
          if (title !== undefined) {
            void saveQueue.enqueue(nodeId, { title });
          }
        }
      }, 600);
    },
    [saveQueue],
  );

  const handleTitleCommit = useCallback(async () => {
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }
    const target = activeNodeRef.current;
    if (!target) return;
    const nodeId = target.id;
    const currentDraftTitle =
      draftRef.current?.nodeId === nodeId ? draftRef.current.title : target.title;
    const trimmed = currentDraftTitle.trim();

    const staged = stagedPatchRef.current.get(nodeId);
    if (staged) {
      const { title: _drop, ...rest } = staged;
      if (rest.content !== undefined) {
        stagedPatchRef.current.set(nodeId, rest);
      } else {
        stagedPatchRef.current.delete(nodeId);
      }
    }

    if (!trimmed) {
      setDraft((prev) =>
        prev?.nodeId === nodeId ? { ...prev, title: target.title } : prev,
      );
      return;
    }
    if (trimmed === target.title) return;
    setSaveStatus("saving");
    await saveQueue.enqueue(nodeId, { title: trimmed });
  }, [saveQueue]);

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      } else if (event.key === "Escape" && activeNodeRef.current) {
        const target = activeNodeRef.current;
        if (titleTimerRef.current) {
          clearTimeout(titleTimerRef.current);
          titleTimerRef.current = null;
        }
        const staged = stagedPatchRef.current.get(target.id);
        if (staged) {
          const { title: _drop, ...rest } = staged;
          if (rest.content !== undefined) {
            stagedPatchRef.current.set(target.id, rest);
          } else {
            stagedPatchRef.current.delete(target.id);
          }
        }
        setDraft((prev) =>
          prev?.nodeId === target.id ? { ...prev, title: target.title } : prev,
        );
        event.currentTarget.blur();
      }
    },
    [],
  );

  const handleCreateChild = useCallback(
    async (input: { type: NodeType; title: string; content?: string }) => {
      const target = activeNodeRef.current;
      if (!target) {
        throw new Error("No active parent node");
      }
      const created = await createNode({
        spaceId: target.spaceId,
        parentId: target.id,
        type: input.type,
        title: input.title,
        content: input.content,
      });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(created.spaceId),
      });
      return created;
    },
    [queryClient],
  );

  const quickCreateMutation = useMutation({
    mutationFn: createNode,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.tree(created.spaceId),
      });
      setActiveView("workspace");
      setActiveSpaceId(created.spaceId);
      setSelectedNodeId(created.id);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create asset");
    },
  });

  const handleReloadRemoteNode = useCallback(
    async (nodeId: string) => {
      if (contentTimerRef.current) {
        clearTimeout(contentTimerRef.current);
        contentTimerRef.current = null;
      }
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
        titleTimerRef.current = null;
      }
      stagedPatchRef.current.delete(nodeId);
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.node(nodeId),
      });
      const fresh = await fetchNode(nodeId);
      queryClient.setQueryData(workspaceQueryKeys.node(nodeId), fresh);
      setDraft({ nodeId: fresh.id, content: fresh.content, title: fresh.title });
      setIsDirty(false);
      setSaveStatus("saved");
    },
    [queryClient],
  );

  const handleSignedOut = useCallback(() => {
    setSelectedNodeId(null);
    setActiveSpaceId(null);
    queryClient.clear();
    void session.refetch();
  }, [queryClient, session]);

  const handleOrganizationChanged = useCallback(() => {
    setSelectedNodeId(null);
    setActiveSpaceId(null);
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const selectNodeAndFlush = useCallback(
    (nodeId: string, spaceId?: string) => {
      if (nodeId !== selectedNodeId) {
        flushPendingSave();
      }
      if (spaceId) setActiveSpaceId(spaceId);
      setSelectedNodeId(nodeId);
    },
    [flushPendingSave, selectedNodeId],
  );

  if (session.isPending) {
    return (
      <ThemeScope theme={themeMode}>
        <div {...stylex.props(styles.loadingScreen)}>Loading Merak workspace...</div>
      </ThemeScope>
    );
  }

  if (!session.data) {
    return (
      <ThemeScope theme={themeMode}>
        <AuthScreen onAuthenticated={() => void session.refetch()} />
      </ThemeScope>
    );
  }

  const headerTitle =
    activeView === "workspace" && activeNode ? (
      <Input
        aria-label="Document title"
        value={effectiveDraftTitle}
        onValueChange={handleTitleChange}
        onBlur={() => void handleTitleCommit()}
        onKeyDown={handleTitleKeyDown}
        {...stylex.props(styles.titleInput)}
      />
    ) : undefined;

  const headerActions =
    activeView === "workspace" && activeNode ? (
      saveStatus === "error" ? (
        <span data-merak-autosave="error" {...stylex.props(styles.saveStatusError)}>
          Save failed
        </span>
      ) : saveStatus === "saving" || isDirty ? (
        <span data-merak-autosave="saving" {...stylex.props(styles.saveStatusText)}>
          Saving…
        </span>
      ) : saveStatus === "saved" ? (
        <span data-merak-autosave="saved" {...stylex.props(styles.saveStatusText)}>
          Saved
        </span>
      ) : null
    ) : undefined;

  return (
    <WorkbenchLayout
      spaces={spaces}
      activeView={activeView}
      onActiveViewChange={setActiveView}
      activeSpaceId={effectiveSpaceId}
      onActiveSpaceChange={(nextSpaceId) => {
        setActiveSpaceId(nextSpaceId);
      }}
      selectedNodeId={selectedNodeId}
      onSelectNode={selectNodeAndFlush}
      theme={themeMode}
      onThemeChange={setThemeMode}
      editingContext={{
        editingNodeId: activeNode?.id ?? null,
        localVersion: activeNode?.version ?? null,
        isDirty,
        currentUserId: session.data.user.id,
      }}
      onReloadRemoteNode={handleReloadRemoteNode}
      headerTitle={headerTitle}
      headerActions={headerActions}
      onNodeCreated={(created) => {
        setActiveSpaceId(created.spaceId);
        setSelectedNodeId(created.id);
      }}
      onNodeDeleted={(nodeId) => {
        if (selectedNodeId === nodeId) {
          setSelectedNodeId(null);
        }
      }}
      onOrganizationChanged={handleOrganizationChanged}
      onSignedOut={handleSignedOut}
    >
      {selectedNodeId && nodeQuery.isLoading ? (
        <div {...stylex.props(styles.loadingScreen)}>Loading asset...</div>
      ) : activeNode ? (
        <div {...stylex.props(styles.editorContainer)}>
          <AssetEditorRouter
            key={activeNode.id}
            node={{ ...activeNode, content: effectiveDraftContent }}
            theme={resolvedTheme}
            onChange={handleContentChange}
            onSave={handleImmediateSave}
            onUploadMedia={(file) =>
              uploadMediaFile(file, { spaceId: activeNode.spaceId })
            }
            onCreateChild={handleCreateChild}
            onOpenNode={(nodeId) => selectNodeAndFlush(nodeId)}
            resolveNode={(nodeId) => fetchNode(nodeId).catch(() => null)}
          />
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles size={28} />}
          title={effectiveSpaceId ? "Select or create an asset" : "Create your first space"}
          description={
            effectiveSpaceId
              ? "Pick any item from the sidebar tree or create a WYSIWYG Markdown page, Excalidraw board, HTML Artifact, or Infinite Canvas."
              : "Use the + button in Knowledge Base or Projects on the left sidebar to create a space."
          }
          action={
            effectiveSpaceId ? (
              <Inline gap="sm" wrap justify="center">
                <Button
                  disabled={quickCreateMutation.isPending}
                  onClick={() =>
                    quickCreateMutation.mutate({
                      spaceId: effectiveSpaceId,
                      parentId: null,
                      type: "folder",
                      title: DEFAULT_TITLES.folder,
                    })
                  }
                  {...stylex.props(styles.emptyActionBtn)}
                >
                  <Folder size={14} />
                  <span>New Folder</span>
                </Button>
                <Button
                  data-variant="solid"
                  disabled={quickCreateMutation.isPending}
                  onClick={() =>
                    quickCreateMutation.mutate({
                      spaceId: effectiveSpaceId,
                      parentId: null,
                      type: "doc",
                      title: DEFAULT_TITLES.doc,
                    })
                  }
                  {...stylex.props(styles.emptyActionBtn)}
                >
                  <FileText size={14} />
                  <span>New Page</span>
                </Button>
                <Button
                  disabled={quickCreateMutation.isPending}
                  onClick={() =>
                    quickCreateMutation.mutate({
                      spaceId: effectiveSpaceId,
                      parentId: null,
                      type: "excalidraw",
                      title: DEFAULT_TITLES.excalidraw,
                    })
                  }
                  {...stylex.props(styles.emptyActionBtn)}
                >
                  <PenTool size={14} />
                  <span>Excalidraw</span>
                </Button>
                <Button
                  disabled={quickCreateMutation.isPending}
                  onClick={() =>
                    quickCreateMutation.mutate({
                      spaceId: effectiveSpaceId,
                      parentId: null,
                      type: "html",
                      title: DEFAULT_TITLES.html,
                    })
                  }
                  {...stylex.props(styles.emptyActionBtn)}
                >
                  <Blocks size={14} />
                  <span>HTML Artifact</span>
                </Button>
                <Button
                  disabled={quickCreateMutation.isPending}
                  onClick={() =>
                    quickCreateMutation.mutate({
                      spaceId: effectiveSpaceId,
                      parentId: null,
                      type: "canvas",
                      title: DEFAULT_TITLES.canvas,
                    })
                  }
                  {...stylex.props(styles.emptyActionBtn)}
                >
                  <Network size={14} />
                  <span>Canvas</span>
                </Button>
              </Inline>
            ) : undefined
          }
        />
      )}
    </WorkbenchLayout>
  );
}
