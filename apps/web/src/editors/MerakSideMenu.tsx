import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  SideMenu,
  useBlockNoteEditor,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { Popover, PopoverContent, PopoverTrigger, toast } from "@merak/ui";
import { colors, font, radius, shadow } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  ChevronRight,
  Code2,
  Copy,
  CopyPlus,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Palette,
  Plus,
  Quote,
  RefreshCw,
  Search,
  Trash2,
  Type,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import {
  BLOCK_BG_COLORS,
  BLOCK_TEXT_COLORS,
  countWordsAndChars,
  extractBlockPlainText,
  getBlockTypeLabel,
} from "./blockMetrics.js";
import { cloneBlocksForDuplicate, resolveBlockMenuShortcut } from "./blockSelection.js";
import {
  formatBlockEquationMarkdown,
  replaceInlineEquationsWithPlaceholders,
  restoreInlineMathInMarkdown,
} from "./mathHelpers.js";

const NON_CONVERTIBLE_BLOCK_TYPES = new Set([
  "merakChild",
  "merakEmbed",
  "merakBlockEquation",
  "divider",
  "image",
  "video",
  "audio",
  "file",
  "table",
]);

const LAST_BLOCK_COLOR_KEY = "merak:last-block-color";

interface LastBlockColor {
  kind: "text" | "bg";
  id: string;
}

function loadLastBlockColor(): LastBlockColor | null {
  try {
    const raw = window.localStorage.getItem(LAST_BLOCK_COLOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastBlockColor>;
    if ((parsed.kind === "text" || parsed.kind === "bg") && typeof parsed.id === "string") {
      return { kind: parsed.kind, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

function saveLastBlockColor(value: LastBlockColor): void {
  try {
    window.localStorage.setItem(LAST_BLOCK_COLOR_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in restricted browsing modes.
  }
}

interface TurnIntoOption {
  id: string;
  label: string;
  keywords: string;
  type: string;
  props?: Record<string, unknown>;
  icon: typeof Type;
}

const TURN_INTO_OPTIONS: readonly TurnIntoOption[] = [
  { id: "turn:paragraph", label: "Text", keywords: "text paragraph p body", type: "paragraph", icon: Type },
  {
    id: "turn:h1",
    label: "Heading 1",
    keywords: "heading 1 h1 title",
    type: "heading",
    props: { level: 1 },
    icon: Heading1,
  },
  {
    id: "turn:h2",
    label: "Heading 2",
    keywords: "heading 2 h2 subtitle",
    type: "heading",
    props: { level: 2 },
    icon: Heading2,
  },
  {
    id: "turn:h3",
    label: "Heading 3",
    keywords: "heading 3 h3",
    type: "heading",
    props: { level: 3 },
    icon: Heading3,
  },
  {
    id: "turn:bullet",
    label: "Bulleted list",
    keywords: "bulleted list ul unordered",
    type: "bulletListItem",
    icon: List,
  },
  {
    id: "turn:numbered",
    label: "Numbered list",
    keywords: "numbered list ol ordered",
    type: "numberedListItem",
    icon: ListOrdered,
  },
  {
    id: "turn:todo",
    label: "To-do list",
    keywords: "todo check task checklist",
    type: "checkListItem",
    icon: CheckSquare,
  },
  { id: "turn:quote", label: "Quote", keywords: "quote blockquote", type: "quote", icon: Quote },
  { id: "turn:code", label: "Code", keywords: "code codeblock pre", type: "codeBlock", icon: Code2 },
  {
    id: "turn:toggle",
    label: "Toggle list",
    keywords: "toggle collapse accordion",
    type: "toggleListItem",
    icon: ChevronRight,
  },
];

type SubmenuKind = "turn-into" | "color";

export interface MerakSideMenuProps {
  onActiveBlockChange?: (blockId: string | null) => void;
}

const styles = stylex.create({
  addTrigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "100%",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderWidth: 0,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: "5px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.textMuted,
    cursor: "pointer",
  },
  dragTrigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "100%",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderWidth: 0,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: "5px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.textMuted,
    cursor: "grab",
  },
  dragTriggerActive: {
    backgroundColor: colors.bgHover,
    color: colors.text,
  },
  popoverPanel: {
    width: "240px",
    maxWidth: "240px",
    gap: 0,
    rowGap: 0,
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "4px",
    paddingRight: "4px",
    backgroundColor: colors.bgElevated,
    borderWidth: 0,
    borderRadius: "10px",
    overflowX: "visible",
    overflowY: "visible",
  },
  panelInner: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    rowGap: 0,
    width: "100%",
  },
  searchWrap: {
    paddingTop: "0px",
    paddingBottom: "4px",
    paddingLeft: "4px",
    paddingRight: "4px",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: "28px",
    paddingLeft: "8px",
    paddingRight: "8px",
    borderRadius: "6px",
    backgroundColor: colors.bgSubtle,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    color: colors.textMuted,
  },
  searchInput: {
    flex: "1 1 auto",
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.text,
    fontFamily: font.sans,
    fontSize: "13px",
    outlineStyle: "none",
  },
  sectionLabel: {
    paddingTop: "4px",
    paddingBottom: "3px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: "11px",
    fontWeight: 500,
    lineHeight: 1.2,
    color: colors.textMuted,
    userSelect: "none",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    width: "100%",
    height: "28px",
    minHeight: "28px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "8px",
    paddingRight: "8px",
    borderWidth: 0,
    borderRadius: "6px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.text,
    fontFamily: font.sans,
    fontSize: "13px",
    lineHeight: "20px",
    textAlign: "left",
    cursor: "pointer",
  },
  actionRowActive: {
    backgroundColor: colors.bgHover,
  },
  actionRowDanger: {
    color: {
      default: colors.danger,
      ":hover": colors.danger,
    },
  },
  actionLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
    flex: "1 1 auto",
  },
  actionIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.textMuted,
    flexShrink: 0,
  },
  actionDangerIcon: {
    color: colors.danger,
  },
  actionText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcutText: {
    fontSize: "11px",
    color: colors.textMuted,
    fontFamily: font.sans,
    flexShrink: 0,
  },
  divider: {
    height: "1px",
    marginTop: "4px",
    marginBottom: "4px",
    marginLeft: "-4px",
    marginRight: "-4px",
    backgroundColor: colors.borderSubtle,
  },
  submenuWrapperRight: {
    position: "absolute",
    left: "calc(100% + 4px)",
    paddingLeft: "8px",
    marginLeft: "-8px",
    zIndex: 40,
  },
  submenuWrapperLeft: {
    position: "absolute",
    right: "calc(100% + 4px)",
    paddingRight: "8px",
    marginRight: "-8px",
    zIndex: 40,
  },
  submenuCardTurnInto: {
    width: "216px",
  },
  submenuCardColor: {
    width: "220px",
  },
  submenuCard: {
    maxHeight: "min(440px, calc(100vh - 24px))",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    rowGap: 0,
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "4px",
    paddingRight: "4px",
    borderRadius: "10px",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.lg,
  },
  scrollList: {
    maxHeight: "290px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    rowGap: 0,
  },
  swatchText: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    fontSize: "12px",
    fontWeight: 600,
    flexShrink: 0,
  },
  swatchBg: {
    display: "inline-block",
    width: "20px",
    height: "20px",
    borderRadius: "5px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    flexShrink: 0,
  },
  footer: {
    paddingTop: "4px",
    paddingBottom: "2px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: "11px",
    color: colors.textMuted,
    lineHeight: 1.35,
  },
  emptyState: {
    paddingTop: "10px",
    paddingBottom: "10px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontSize: "12px",
    color: colors.textMuted,
    textAlign: "center",
  },
});

export function MerakSideMenu({ onActiveBlockChange }: MerakSideMenuProps) {
  const editor = useBlockNoteEditor();
  const sideMenu = useExtension(SideMenuExtension);
  const sideMenuState = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => (state ? { show: state.show, block: state.block } : undefined),
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [lockedBlockId, setLockedBlockId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuKind | null>(null);
  const [submenuFlipLeft, setSubmenuFlipLeft] = useState(false);
  const [submenuTop, setSubmenuTop] = useState(0);
  const [lastColor, setLastColor] = useState<LastBlockColor | null>(() => loadLastBlockColor());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const turnIntoRowRef = useRef<HTMLButtonElement>(null);
  const colorRowRef = useRef<HTMLButtonElement>(null);
  const submenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFrozenRef = useRef(false);

  const liveBlock = sideMenuState?.block;
  const activeBlock = useMemo(() => {
    if (menuOpen && lockedBlockId) {
      return editor.getBlock(lockedBlockId) ?? liveBlock;
    }
    return liveBlock;
  }, [editor, liveBlock, lockedBlockId, menuOpen]);

  const cancelSubmenuClose = useCallback(() => {
    if (submenuCloseTimerRef.current) {
      clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
  }, []);

  const scheduleSubmenuClose = useCallback(() => {
    cancelSubmenuClose();
    submenuCloseTimerRef.current = setTimeout(() => {
      submenuCloseTimerRef.current = null;
      setOpenSubmenu(null);
    }, 150);
  }, [cancelSubmenuClose]);

  const openSubmenuWithLayout = useCallback(
    (kind: SubmenuKind, anchorEl: HTMLElement | null) => {
      cancelSubmenuClose();
      const panelEl = panelRef.current;
      if (panelEl && typeof window !== "undefined") {
        const panelRect = panelEl.getBoundingClientRect();
        const cardWidth = kind === "color" ? 228 : 224;
        setSubmenuFlipLeft(panelRect.right + cardWidth > window.innerWidth - 8);

        const maxPanelHeight = Math.min(440, window.innerHeight - 24);
        const estimatedHeight = kind === "turn-into" ? Math.min(296, maxPanelHeight) : maxPanelHeight;
        const desiredViewportTop = anchorEl
          ? anchorEl.getBoundingClientRect().top - 6
          : panelRect.top;
        const clampedViewportTop = Math.max(
          12,
          Math.min(desiredViewportTop, window.innerHeight - estimatedHeight - 12),
        );
        setSubmenuTop(Math.round(clampedViewportTop - panelRect.top));
      } else {
        setSubmenuFlipLeft(false);
        setSubmenuTop(0);
      }
      setOpenSubmenu(kind);
    },
    [cancelSubmenuClose],
  );

  const closeMenu = useCallback(() => {
    cancelSubmenuClose();
    setMenuOpen(false);
    setLockedBlockId(null);
    setSearchQuery("");
    setOpenSubmenu(null);
    if (isFrozenRef.current) {
      isFrozenRef.current = false;
      sideMenu.unfreezeMenu();
    }
    onActiveBlockChange?.(null);
  }, [cancelSubmenuClose, onActiveBlockChange, sideMenu]);

  useEffect(() => {
    return () => {
      cancelSubmenuClose();
      if (isFrozenRef.current) {
        isFrozenRef.current = false;
        sideMenu.unfreezeMenu();
        onActiveBlockChange?.(null);
      }
    };
  }, [cancelSubmenuClose, onActiveBlockChange, sideMenu]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const targetId = sideMenuState?.block?.id ?? null;
        if (!targetId) return;
        cancelSubmenuClose();
        setLockedBlockId(targetId);
        setSearchQuery("");
        setOpenSubmenu(null);
        setMenuOpen(true);
        isFrozenRef.current = true;
        sideMenu.freezeMenu();
        onActiveBlockChange?.(targetId);
      } else {
        closeMenu();
      }
    },
    [cancelSubmenuClose, closeMenu, onActiveBlockChange, sideMenu, sideMenuState?.block?.id],
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      if (!liveBlock) return;
      if (menuOpen) {
        cancelSubmenuClose();
        setMenuOpen(false);
        setLockedBlockId(null);
        setSearchQuery("");
        setOpenSubmenu(null);
        if (isFrozenRef.current) {
          isFrozenRef.current = false;
          sideMenu.unfreezeMenu();
        }
        onActiveBlockChange?.(null);
      }
      sideMenu.blockDragStart(
        {
          dataTransfer: event.dataTransfer,
          clientY: event.clientY,
        },
        liveBlock,
      );
    },
    [cancelSubmenuClose, liveBlock, menuOpen, onActiveBlockChange, sideMenu],
  );

  const handleDragEnd = useCallback(() => {
    sideMenu.blockDragEnd();
  }, [sideMenu]);

  const targetBlock = activeBlock;
  const targetBlockId = targetBlock?.id;
  const canConvert = targetBlock ? !NON_CONVERTIBLE_BLOCK_TYPES.has(targetBlock.type) : false;

  const handleAddBlock = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!editor.isEditable) return;
      const anchor = liveBlock ?? targetBlock;
      if (!anchor) return;
      if (menuOpen) {
        closeMenu();
      }
      const inserted = editor.insertBlocks(
        [{ type: "paragraph" }],
        anchor.id,
        event.altKey ? "before" : "after",
      );
      const nextBlock = inserted[0];
      if (nextBlock) {
        queueMicrotask(() => {
          editor.setTextCursorPosition(nextBlock.id, "start");
          editor.focus();
        });
      }
    },
    [closeMenu, editor, liveBlock, menuOpen, targetBlock],
  );

  const stats = useMemo(() => {
    if (!targetBlock) return { words: 0, chars: 0 };
    return countWordsAndChars(extractBlockPlainText(targetBlock));
  }, [targetBlock]);

  const blockLabel = targetBlock ? getBlockTypeLabel(targetBlock) : "Block";

  const handleCopyMarkdown = useCallback(async () => {
    if (!targetBlockId) return;
    const current = editor.getBlock(targetBlockId);
    if (!current) return;
    try {
      let md: string;
      if ((current.type as string) === "merakBlockEquation") {
        const currentProps = current.props as Record<string, unknown> | undefined;
        const latex = typeof currentProps?.latex === "string" ? currentProps.latex : "";
        md = formatBlockEquationMarkdown(latex);
      } else {
        const { blocks: prepared, equations } = replaceInlineEquationsWithPlaceholders([current]);
        md = restoreInlineMathInMarkdown(
          editor.blocksToMarkdownLossy(prepared as Parameters<typeof editor.blocksToMarkdownLossy>[0]),
          equations,
        );
      }
      await navigator.clipboard.writeText(md);
      toast.success("Copied block Markdown");
    } catch {
      toast.error("Failed to copy block Markdown");
    }
    closeMenu();
  }, [closeMenu, editor, targetBlockId]);

  const handleDuplicate = useCallback(() => {
    if (!targetBlockId) return;
    const current = editor.getBlock(targetBlockId);
    if (!current) return;
    const clones = cloneBlocksForDuplicate([current]);
    editor.insertBlocks(clones as Parameters<typeof editor.insertBlocks>[0], current.id, "after");
    closeMenu();
  }, [closeMenu, editor, targetBlockId]);

  const handleMoveUp = useCallback(() => {
    if (!targetBlockId) return;
    editor.moveBlocksUp(targetBlockId);
    closeMenu();
  }, [closeMenu, editor, targetBlockId]);

  const handleMoveDown = useCallback(() => {
    if (!targetBlockId) return;
    editor.moveBlocksDown(targetBlockId);
    closeMenu();
  }, [closeMenu, editor, targetBlockId]);

  const handleDelete = useCallback(() => {
    if (!targetBlockId || !editor.isEditable) return;
    const remaining = editor.document.filter((b) => b.id !== targetBlockId);
    if (remaining.length === 0) {
      editor.replaceBlocks([targetBlockId], [{ type: "paragraph" }]);
    } else {
      editor.removeBlocks([targetBlockId]);
    }
    closeMenu();
    queueMicrotask(() => {
      editor.focus();
    });
  }, [closeMenu, editor, targetBlockId]);

  useEffect(() => {
    if (!menuOpen || !targetBlockId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const searchEl = searchInputRef.current;
      const isSearchInput = event.target === searchEl;
      const hasSearchSelection =
        Boolean(searchEl) &&
        searchEl!.selectionStart !== null &&
        searchEl!.selectionEnd !== null &&
        searchEl!.selectionStart !== searchEl!.selectionEnd;

      const action = resolveBlockMenuShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isComposing: event.isComposing,
        isEditable: editor.isEditable,
        isSearchInput,
        searchQuery,
        hasSearchSelection,
      });

      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      if (action === "delete") {
        handleDelete();
      } else if (action === "duplicate") {
        handleDuplicate();
      } else if (action === "copy") {
        void handleCopyMarkdown();
      } else if (action === "move-up") {
        handleMoveUp();
      } else if (action === "move-down") {
        handleMoveDown();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    editor,
    handleCopyMarkdown,
    handleDelete,
    handleDuplicate,
    handleMoveDown,
    handleMoveUp,
    menuOpen,
    searchQuery,
    targetBlockId,
  ]);

  const handleTurnInto = useCallback(
    (option: TurnIntoOption) => {
      if (!targetBlockId) return;
      const current = editor.getBlock(targetBlockId);
      if (!current || NON_CONVERTIBLE_BLOCK_TYPES.has(current.type)) return;
      editor.updateBlock(current.id, {
        type: option.type,
        ...(option.props ? { props: option.props } : {}),
      } as Parameters<typeof editor.updateBlock>[1]);
      closeMenu();
    },
    [closeMenu, editor, targetBlockId],
  );

  const handleSetTextColor = useCallback(
    (colorId: string) => {
      if (!targetBlockId) return;
      editor.updateBlock(targetBlockId, {
        props: { textColor: colorId },
      } as Parameters<typeof editor.updateBlock>[1]);
      const nextLast: LastBlockColor = { kind: "text", id: colorId };
      setLastColor(nextLast);
      saveLastBlockColor(nextLast);
      closeMenu();
    },
    [closeMenu, editor, targetBlockId],
  );

  const handleSetBgColor = useCallback(
    (colorId: string) => {
      if (!targetBlockId) return;
      editor.updateBlock(targetBlockId, {
        props: { backgroundColor: colorId },
      } as Parameters<typeof editor.updateBlock>[1]);
      const nextLast: LastBlockColor = { kind: "bg", id: colorId };
      setLastColor(nextLast);
      saveLastBlockColor(nextLast);
      closeMenu();
    },
    [closeMenu, editor, targetBlockId],
  );

  const searchableActions = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      keywords: string;
      shortcut?: string;
      danger?: boolean;
      icon: typeof Type;
      run: () => void;
    }> = [];

    if (canConvert) {
      for (const opt of TURN_INTO_OPTIONS) {
        items.push({
          id: opt.id,
          label: `Turn into ${opt.label}`,
          keywords: `turn into ${opt.keywords}`,
          icon: opt.icon,
          run: () => handleTurnInto(opt),
        });
      }
      for (const color of BLOCK_TEXT_COLORS) {
        items.push({
          id: `color:text:${color.id}`,
          label: `${color.label} text`,
          keywords: `color text ${color.label.toLowerCase()}`,
          icon: Palette,
          run: () => handleSetTextColor(color.id),
        });
      }
      for (const color of BLOCK_BG_COLORS) {
        items.push({
          id: `color:bg:${color.id}`,
          label: `${color.label} background`,
          keywords: `color background highlight ${color.label.toLowerCase()}`,
          icon: Palette,
          run: () => handleSetBgColor(color.id),
        });
      }
    }

    items.push(
      {
        id: "copy-markdown",
        label: "Copy Markdown",
        keywords: "copy markdown md link clipboard",
        shortcut: "⌘C",
        icon: Copy,
        run: () => void handleCopyMarkdown(),
      },
      {
        id: "duplicate",
        label: "Duplicate",
        keywords: "duplicate clone copy block",
        shortcut: "⌘D",
        icon: CopyPlus,
        run: handleDuplicate,
      },
      {
        id: "move-up",
        label: "Move up",
        keywords: "move up order reorder",
        shortcut: "⌘⇧↑",
        icon: ArrowUp,
        run: handleMoveUp,
      },
      {
        id: "move-down",
        label: "Move down",
        keywords: "move down order reorder",
        shortcut: "⌘⇧↓",
        icon: ArrowDown,
        run: handleMoveDown,
      },
      {
        id: "delete",
        label: "Delete",
        keywords: "delete remove trash",
        shortcut: "Del",
        danger: true,
        icon: Trash2,
        run: handleDelete,
      },
    );

    return items;
  }, [
    canConvert,
    handleCopyMarkdown,
    handleDelete,
    handleDuplicate,
    handleMoveDown,
    handleMoveUp,
    handleSetBgColor,
    handleSetTextColor,
    handleTurnInto,
  ]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredActions = useMemo(() => {
    if (!normalizedQuery) return [];
    return searchableActions.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.keywords.includes(normalizedQuery),
    );
  }, [normalizedQuery, searchableActions]);

  const currentProps = (targetBlock?.props ?? {}) as Record<string, unknown>;
  const currentTextColor = typeof currentProps.textColor === "string" ? currentProps.textColor : "default";
  const currentBgColor = typeof currentProps.backgroundColor === "string" ? currentProps.backgroundColor : "default";

  const lastColorOption = useMemo(() => {
    if (!lastColor) return null;
    const palette = lastColor.kind === "text" ? BLOCK_TEXT_COLORS : BLOCK_BG_COLORS;
    const match = palette.find((c) => c.id === lastColor.id);
    return match ? { kind: lastColor.kind, color: match } : null;
  }, [lastColor]);

  const handleCloseSubmenuOnOtherHover = useCallback(() => {
    cancelSubmenuClose();
    if (openSubmenu) setOpenSubmenu(null);
  }, [cancelSubmenuClose, openSubmenu]);

  return (
    <SideMenu>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleAddBlock}
        aria-label="Add block below"
        title="Click to add a block below · Option-click to add above"
        data-merak-add-block="true"
        {...stylex.props(styles.addTrigger)}
      >
        <Plus size={15} strokeWidth={1.9} />
      </button>
      <Popover open={menuOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          draggable={Boolean(liveBlock)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          data-merak-drag-handle="true"
          data-active={menuOpen ? "true" : undefined}
          title="Drag to move · Click for block menu"
          {...stylex.props(styles.dragTrigger, menuOpen && styles.dragTriggerActive)}
        >
          <GripVertical size={14} />
        </PopoverTrigger>

        <PopoverContent
          side="left"
          align="start"
          sideOffset={8}
          initialFocus={() => searchInputRef.current}
          data-merak-popover="block"
          {...stylex.props(styles.popoverPanel)}
        >
          <div ref={panelRef} {...stylex.props(styles.panelInner)}>
            <div {...stylex.props(styles.searchWrap)}>
              <div {...stylex.props(styles.searchBox)}>
                <Search size={13} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim()) {
                      setOpenSubmenu(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filteredActions.length > 0) {
                      e.preventDefault();
                      filteredActions[0]?.run();
                    }
                  }}
                  placeholder="Search actions..."
                  aria-label="Search block actions"
                  {...stylex.props(styles.searchInput)}
                />
              </div>
            </div>

            {normalizedQuery.length > 0 ? (
              <div {...stylex.props(styles.scrollList)}>
                {filteredActions.length === 0 ? (
                  <div {...stylex.props(styles.emptyState)}>No matching actions</div>
                ) : (
                  filteredActions.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.run}
                        {...stylex.props(styles.actionRow, item.danger && styles.actionRowDanger)}
                      >
                        <span {...stylex.props(styles.actionLeft)}>
                          <span
                            {...stylex.props(
                              styles.actionIcon,
                              item.danger && styles.actionDangerIcon,
                            )}
                          >
                            <Icon size={14} />
                          </span>
                          <span {...stylex.props(styles.actionText)}>{item.label}</span>
                        </span>
                        {item.shortcut ? (
                          <span {...stylex.props(styles.shortcutText)}>{item.shortcut}</span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <>
                <div {...stylex.props(styles.sectionLabel)}>{blockLabel}</div>
                {canConvert ? (
                  <>
                    <button
                      ref={turnIntoRowRef}
                      type="button"
                      aria-expanded={openSubmenu === "turn-into"}
                      onMouseEnter={() => openSubmenuWithLayout("turn-into", turnIntoRowRef.current)}
                      onMouseLeave={scheduleSubmenuClose}
                      onClick={() => openSubmenuWithLayout("turn-into", turnIntoRowRef.current)}
                      {...stylex.props(
                        styles.actionRow,
                        openSubmenu === "turn-into" && styles.actionRowActive,
                      )}
                    >
                      <span {...stylex.props(styles.actionLeft)}>
                        <span {...stylex.props(styles.actionIcon)}>
                          <RefreshCw size={14} />
                        </span>
                        <span {...stylex.props(styles.actionText)}>Turn into</span>
                      </span>
                      <ChevronRight size={14} />
                    </button>

                    <button
                      ref={colorRowRef}
                      type="button"
                      aria-expanded={openSubmenu === "color"}
                      onMouseEnter={() => openSubmenuWithLayout("color", colorRowRef.current)}
                      onMouseLeave={scheduleSubmenuClose}
                      onClick={() => openSubmenuWithLayout("color", colorRowRef.current)}
                      {...stylex.props(
                        styles.actionRow,
                        openSubmenu === "color" && styles.actionRowActive,
                      )}
                    >
                      <span {...stylex.props(styles.actionLeft)}>
                        <span {...stylex.props(styles.actionIcon)}>
                          <Palette size={14} />
                        </span>
                        <span {...stylex.props(styles.actionText)}>Color</span>
                      </span>
                      <ChevronRight size={14} />
                    </button>

                    <div {...stylex.props(styles.divider)} />
                  </>
                ) : null}

                <button
                  type="button"
                  onMouseEnter={handleCloseSubmenuOnOtherHover}
                  onClick={() => void handleCopyMarkdown()}
                  {...stylex.props(styles.actionRow)}
                >
                  <span {...stylex.props(styles.actionLeft)}>
                    <span {...stylex.props(styles.actionIcon)}>
                      <Copy size={14} />
                    </span>
                    <span {...stylex.props(styles.actionText)}>Copy Markdown</span>
                  </span>
                  <span {...stylex.props(styles.shortcutText)}>⌘C</span>
                </button>

                <button
                  type="button"
                  onMouseEnter={handleCloseSubmenuOnOtherHover}
                  onClick={handleDuplicate}
                  {...stylex.props(styles.actionRow)}
                >
                  <span {...stylex.props(styles.actionLeft)}>
                    <span {...stylex.props(styles.actionIcon)}>
                      <CopyPlus size={14} />
                    </span>
                    <span {...stylex.props(styles.actionText)}>Duplicate</span>
                  </span>
                  <span {...stylex.props(styles.shortcutText)}>⌘D</span>
                </button>

                <button
                  type="button"
                  onMouseEnter={handleCloseSubmenuOnOtherHover}
                  onClick={handleMoveUp}
                  {...stylex.props(styles.actionRow)}
                >
                  <span {...stylex.props(styles.actionLeft)}>
                    <span {...stylex.props(styles.actionIcon)}>
                      <ArrowUp size={14} />
                    </span>
                    <span {...stylex.props(styles.actionText)}>Move up</span>
                  </span>
                  <span {...stylex.props(styles.shortcutText)}>⌘⇧↑</span>
                </button>

                <button
                  type="button"
                  onMouseEnter={handleCloseSubmenuOnOtherHover}
                  onClick={handleMoveDown}
                  {...stylex.props(styles.actionRow)}
                >
                  <span {...stylex.props(styles.actionLeft)}>
                    <span {...stylex.props(styles.actionIcon)}>
                      <ArrowDown size={14} />
                    </span>
                    <span {...stylex.props(styles.actionText)}>Move down</span>
                  </span>
                  <span {...stylex.props(styles.shortcutText)}>⌘⇧↓</span>
                </button>

                <div {...stylex.props(styles.divider)} />

                <button
                  type="button"
                  onMouseEnter={handleCloseSubmenuOnOtherHover}
                  onClick={handleDelete}
                  {...stylex.props(styles.actionRow, styles.actionRowDanger)}
                >
                  <span {...stylex.props(styles.actionLeft)}>
                    <span {...stylex.props(styles.actionIcon, styles.actionDangerIcon)}>
                      <Trash2 size={14} />
                    </span>
                    <span {...stylex.props(styles.actionText)}>Delete</span>
                  </span>
                  <span {...stylex.props(styles.shortcutText)}>Del</span>
                </button>

                <div {...stylex.props(styles.divider)} />

                <div {...stylex.props(styles.footer)}>
                  {stats.words} {stats.words === 1 ? "word" : "words"}, {stats.chars}{" "}
                  {stats.chars === 1 ? "char" : "chars"}
                </div>

                {openSubmenu && canConvert ? (
                  <div
                    data-merak-submenu-side={submenuFlipLeft ? "left" : "right"}
                    style={{ top: submenuTop }}
                    onMouseEnter={cancelSubmenuClose}
                    onMouseLeave={scheduleSubmenuClose}
                    {...stylex.props(
                      submenuFlipLeft ? styles.submenuWrapperLeft : styles.submenuWrapperRight,
                    )}
                  >
                    <div
                      data-merak-submenu={openSubmenu}
                      {...stylex.props(
                        styles.submenuCard,
                        openSubmenu === "color"
                          ? styles.submenuCardColor
                          : styles.submenuCardTurnInto,
                      )}
                    >
                      {openSubmenu === "turn-into" ? (
                        TURN_INTO_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const isCurrent =
                            targetBlock?.type === option.type &&
                            (option.type !== "heading" ||
                              currentProps.level === option.props?.level);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleTurnInto(option)}
                              {...stylex.props(styles.actionRow)}
                            >
                              <span {...stylex.props(styles.actionLeft)}>
                                <span {...stylex.props(styles.actionIcon)}>
                                  <Icon size={14} />
                                </span>
                                <span {...stylex.props(styles.actionText)}>{option.label}</span>
                              </span>
                              {isCurrent ? <Check size={13} /> : null}
                            </button>
                          );
                        })
                      ) : (
                        <>
                          {lastColorOption ? (
                            <>
                              <div {...stylex.props(styles.sectionLabel)}>Last used</div>
                              <button
                                type="button"
                                onClick={() =>
                                  lastColorOption.kind === "text"
                                    ? handleSetTextColor(lastColorOption.color.id)
                                    : handleSetBgColor(lastColorOption.color.id)
                                }
                                {...stylex.props(styles.actionRow)}
                              >
                                <span {...stylex.props(styles.actionLeft)}>
                                  {lastColorOption.kind === "text" ? (
                                    <span
                                      style={{ color: lastColorOption.color.textSwatch }}
                                      {...stylex.props(styles.swatchText)}
                                    >
                                      A
                                    </span>
                                  ) : (
                                    <span
                                      style={{ backgroundColor: lastColorOption.color.bgSwatch }}
                                      {...stylex.props(styles.swatchBg)}
                                    />
                                  )}
                                  <span {...stylex.props(styles.actionText)}>
                                    {lastColorOption.kind === "text"
                                      ? `${lastColorOption.color.label} text`
                                      : `${lastColorOption.color.label} background`}
                                  </span>
                                </span>
                                <span {...stylex.props(styles.shortcutText)}>⌘⇧H</span>
                              </button>
                              <div {...stylex.props(styles.divider)} />
                            </>
                          ) : null}

                          <div {...stylex.props(styles.sectionLabel)}>Text color</div>
                          {BLOCK_TEXT_COLORS.map((color) => (
                            <button
                              key={`text-${color.id}`}
                              type="button"
                              onClick={() => handleSetTextColor(color.id)}
                              {...stylex.props(styles.actionRow)}
                            >
                              <span {...stylex.props(styles.actionLeft)}>
                                <span
                                  style={{ color: color.textSwatch }}
                                  {...stylex.props(styles.swatchText)}
                                >
                                  A
                                </span>
                                <span {...stylex.props(styles.actionText)}>{color.label} text</span>
                              </span>
                              {currentTextColor === color.id ? <Check size={13} /> : null}
                            </button>
                          ))}

                          <div {...stylex.props(styles.divider)} />
                          <div {...stylex.props(styles.sectionLabel)}>Background</div>
                          {BLOCK_BG_COLORS.map((color) => (
                            <button
                              key={`bg-${color.id}`}
                              type="button"
                              onClick={() => handleSetBgColor(color.id)}
                              {...stylex.props(styles.actionRow)}
                            >
                              <span {...stylex.props(styles.actionLeft)}>
                                <span
                                  style={{ backgroundColor: color.bgSwatch }}
                                  {...stylex.props(styles.swatchBg)}
                                />
                                <span {...stylex.props(styles.actionText)}>
                                  {color.label} background
                                </span>
                              </span>
                              {currentBgColor === color.id ? <Check size={13} /> : null}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </SideMenu>
  );
}
