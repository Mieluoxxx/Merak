import type { NodeType, SearchResultDto, SpaceDto } from "@merak/shared";
import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandItemIcon,
  CommandItemText,
  CommandList,
  CommandSeparator,
  CommandStatus,
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogTitle,
  useShortcut,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import {
  Blocks,
  FileText,
  Folder,
  Image as ImageIcon,
  KeyRound,
  Network,
  PenTool,
  Plus,
  Search,
  SunMoon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { searchWorkspace, workspaceQueryKeys } from "../api/workspace-api.js";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces?: SpaceDto[];
  activeSpaceId?: string | null;
  initialQuery?: string;
  enableGlobalShortcut?: boolean;
  onSelectNode: (nodeId: string, spaceId: string) => void;
  onOpenGallery?: () => void;
  onOpenMcpTokens?: () => void;
  onCreateNode?: (type: NodeType, spaceId: string) => void;
  onCycleTheme?: () => void;
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  doc: "Doc",
  excalidraw: "Whiteboard",
  html: "HTML",
  canvas: "Canvas",
  folder: "Folder",
};

const styles = stylex.create({
  dialogContent: {
    width: "100%",
    maxWidth: "600px",
    padding: 0,
    overflow: "hidden",
  },
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
  commandRoot: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderBottom: `1px solid ${colors.border}`,
  },
  inputIcon: {
    color: colors.textSubtle,
    flexShrink: 0,
  },
  input: {
    flex: "1 1 auto",
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    color: colors.text,
    fontSize: font.sizeMd,
  },
  list: {
    maxHeight: "380px",
    overflowY: "auto",
    padding: space.xs,
  },
  resultRow: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    minWidth: 0,
    flex: "1 1 auto",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  resultTitle: {
    fontSize: font.sizeSm,
    fontWeight: 500,
    color: colors.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultSnippet: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resultBadges: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 0,
  },
  statusBar: {
    paddingBlock: space.xs,
    paddingInline: space.md,
    borderTop: `1px solid ${colors.borderSubtle}`,
    fontSize: font.sizeXs,
    color: colors.textSubtle,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  empty: {
    paddingBlock: space.xl,
    paddingInline: space.md,
    textAlign: "center",
    fontSize: font.sizeSm,
    color: colors.textMuted,
  },
  kbd: {
    fontFamily: font.mono,
    fontSize: "11px",
    paddingBlock: "1px",
    paddingInline: space.xs,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgSubtle,
    color: colors.textMuted,
  },
});

function renderNodeIcon(type: NodeType) {
  switch (type) {
    case "folder":
      return <Folder size={14} />;
    case "excalidraw":
      return <PenTool size={14} />;
    case "html":
      return <Blocks size={14} />;
    case "canvas":
      return <Network size={14} />;
    default:
      return <FileText size={14} />;
  }
}

function stripHighlightMarkup(snippet: string): string {
  return snippet.replace(/<\/?mark>/gi, "");
}

interface QuickActionDef {
  id: string;
  label: string;
  keywords: string[];
  icon: ReturnType<typeof renderNodeIcon>;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  spaces = [],
  activeSpaceId = null,
  initialQuery = "",
  enableGlobalShortcut = true,
  onSelectNode,
  onOpenGallery,
  onOpenMcpTokens,
  onCreateNode,
  onCycleTheme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim());

  useShortcut(
    enableGlobalShortcut ? "mod+k" : null,
    (event) => {
      event.preventDefault();
      onOpenChange(!open);
    },
  );

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setDebouncedQuery(initialQuery.trim());
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open, initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const spaceNameMap = useMemo(
    () => new Map(spaces.map((item) => [item.id, item.name])),
    [spaces],
  );

  const searchQuery = useQuery({
    queryKey: workspaceQueryKeys.search(debouncedQuery),
    queryFn: () => searchWorkspace(debouncedQuery, { limit: 20 }),
    enabled: open && debouncedQuery.length > 0,
    staleTime: 5_000,
  });

  const targetSpaceId = activeSpaceId ?? spaces[0]?.id ?? null;

  const quickActions = useMemo<QuickActionDef[]>(() => {
    const actions: QuickActionDef[] = [];
    if (onCreateNode && targetSpaceId) {
      actions.push(
        {
          id: "action:create-folder",
          label: "New Folder",
          keywords: ["create", "new", "folder", "directory", "subfolder"],
          icon: <Folder size={14} />,
          run: () => onCreateNode("folder", targetSpaceId),
        },
        {
          id: "action:create-doc",
          label: "New Markdown Document",
          keywords: ["create", "new", "doc", "markdown", "page"],
          icon: <Plus size={14} />,
          run: () => onCreateNode("doc", targetSpaceId),
        },
        {
          id: "action:create-excalidraw",
          label: "New Excalidraw Whiteboard",
          keywords: ["create", "new", "whiteboard", "excalidraw", "diagram"],
          icon: <PenTool size={14} />,
          run: () => onCreateNode("excalidraw", targetSpaceId),
        },
        {
          id: "action:create-html",
          label: "New HTML Artifact",
          keywords: ["create", "new", "html", "artifact", "preview"],
          icon: <Blocks size={14} />,
          run: () => onCreateNode("html", targetSpaceId),
        },
        {
          id: "action:create-canvas",
          label: "New Infinite Canvas",
          keywords: ["create", "new", "canvas", "board"],
          icon: <Network size={14} />,
          run: () => onCreateNode("canvas", targetSpaceId),
        },
      );
    }
    if (onOpenGallery) {
      actions.push({
        id: "action:open-gallery",
        label: "Open Media Gallery",
        keywords: ["media", "gallery", "images", "uploads", "orphans"],
        icon: <ImageIcon size={14} />,
        run: () => onOpenGallery(),
      });
    }
    if (onOpenMcpTokens) {
      actions.push({
        id: "action:open-mcp-tokens",
        label: "Manage MCP Agent Tokens",
        keywords: ["mcp", "tokens", "api", "agent", "keys"],
        icon: <KeyRound size={14} />,
        run: () => onOpenMcpTokens(),
      });
    }
    if (onCycleTheme) {
      actions.push({
        id: "action:cycle-theme",
        label: "Switch Theme (System / Light / Dark)",
        keywords: ["theme", "dark", "light", "appearance"],
        icon: <SunMoon size={14} />,
        run: () => onCycleTheme(),
      });
    }
    return actions;
  }, [onCreateNode, onCycleTheme, onOpenGallery, onOpenMcpTokens, targetSpaceId]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickActions;
    return quickActions.filter(
      (action) =>
        action.label.toLowerCase().includes(q) ||
        action.keywords.some((kw) => kw.includes(q)),
    );
  }, [query, quickActions]);

  const results: SearchResultDto[] = debouncedQuery ? (searchQuery.data ?? []) : [];

  const handleAction = (value: string) => {
    const matchedResult = results.find((item) => `node:${item.nodeId}` === value);
    if (matchedResult) {
      onSelectNode(matchedResult.nodeId, matchedResult.spaceId);
      onOpenChange(false);
      return;
    }

    const matchedQuickAction = quickActions.find((action) => action.id === value);
    if (matchedQuickAction) {
      matchedQuickAction.run();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <DialogBackdrop />
      <DialogContent {...stylex.props(styles.dialogContent)}>
        <DialogTitle {...stylex.props(styles.srOnly)}>Workspace Command Palette</DialogTitle>

        <Command
          query={query}
          onQueryChange={(nextQuery) => setQuery(nextQuery)}
          filter={false}
          onAction={handleAction}
          {...stylex.props(styles.commandRoot)}
        >
          <div {...stylex.props(styles.inputRow)}>
            <Search size={16} {...stylex.props(styles.inputIcon)} />
            <CommandInput
              aria-label="Search workspace documents and commands"
              placeholder="Search docs, whiteboards, artifacts, or run a command..."
              autoFocus
              {...stylex.props(styles.input)}
            />
            <span {...stylex.props(styles.kbd)}>ESC</span>
          </div>

          <CommandList {...stylex.props(styles.list)}>
            {debouncedQuery.length > 0 && results.length > 0 ? (
              <CommandGroup>
                <CommandGroupLabel>Search Results</CommandGroupLabel>
                {results.map((item) => {
                  const spaceLabel = spaceNameMap.get(item.spaceId) ?? item.spaceId;
                  const cleanSnippet = stripHighlightMarkup(item.snippet);
                  return (
                    <CommandItem
                      key={item.nodeId}
                      value={`node:${item.nodeId}`}
                      label={item.title}
                    >
                      <CommandItemIcon>{renderNodeIcon(item.type)}</CommandItemIcon>
                      <div {...stylex.props(styles.resultRow)}>
                        <div {...stylex.props(styles.resultHeader)}>
                          <CommandItemText {...stylex.props(styles.resultTitle)}>
                            {item.title}
                          </CommandItemText>
                          <span {...stylex.props(styles.resultBadges)}>
                            <Badge tone="accent">{NODE_TYPE_LABELS[item.type]}</Badge>
                            <Badge tone="neutral">{spaceLabel}</Badge>
                          </span>
                        </div>
                        {cleanSnippet ? (
                          <span {...stylex.props(styles.resultSnippet)}>{cleanSnippet}</span>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {debouncedQuery.length > 0 && results.length > 0 && filteredActions.length > 0 ? (
              <CommandSeparator />
            ) : null}

            {filteredActions.length > 0 ? (
              <CommandGroup>
                <CommandGroupLabel>Quick Actions</CommandGroupLabel>
                {filteredActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={action.id}
                    label={action.label}
                    keywords={action.keywords}
                  >
                    <CommandItemIcon>{action.icon}</CommandItemIcon>
                    <CommandItemText>{action.label}</CommandItemText>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>

          <CommandEmpty {...stylex.props(styles.empty)}>
            {searchQuery.isFetching
              ? "Searching workspace..."
              : `No matching documents or actions for "${query}".`}
          </CommandEmpty>

          <CommandStatus {...stylex.props(styles.statusBar)}>
            <span>
              {searchQuery.isFetching
                ? "Searching FTS5 index..."
                : debouncedQuery
                  ? `${results.length} ${results.length === 1 ? "result" : "results"}`
                  : "Type to search across all spaces"}
            </span>
            <span>Enter to select · ↑↓ to navigate</span>
          </CommandStatus>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
