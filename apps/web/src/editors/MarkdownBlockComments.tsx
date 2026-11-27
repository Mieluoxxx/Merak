import type {
  CommentMessageDto,
  CommentThreadDto,
} from "@merak/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Check,
  MessageSquare,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createCommentThread,
  deleteCommentMessage,
  deleteCommentThread,
  fetchNodeComments,
  replyCommentThread,
  updateCommentMessage,
  updateCommentThread,
  workspaceQueryKeys,
} from "../features/api/workspace-api.js";
import { useSession } from "../lib/auth-client.js";
import { type BlockTextLike, extractBlockPlainText } from "./blockMetrics.js";

export interface FlatEditorBlock {
  id: string;
  index: number;
  type: string;
  text: string;
}

interface EditorBlockWithId extends BlockTextLike {
  id?: string;
  children?: readonly EditorBlockWithId[];
}

export function flattenEditorBlocks(
  blocks: readonly EditorBlockWithId[] | undefined,
): FlatEditorBlock[] {
  if (!blocks || blocks.length === 0) return [];
  const flat: FlatEditorBlock[] = [];

  const visit = (items: readonly EditorBlockWithId[]) => {
    for (const block of items) {
      if (typeof block.id === "string" && typeof block.type === "string") {
        const text = extractBlockPlainText(block).replace(/\s+/g, " ").trim();
        flat.push({
          id: block.id,
          index: flat.length,
          type: block.type,
          text: text.slice(0, 400),
        });
      }
      if (Array.isArray(block.children) && block.children.length > 0) {
        visit(block.children);
      }
    }
  };

  visit(blocks);
  return flat;
}

function pickClosestByIndex(
  matches: readonly FlatEditorBlock[],
  targetIndex: number,
): FlatEditorBlock | undefined {
  let best: FlatEditorBlock | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of matches) {
    const dist = Math.abs(candidate.index - targetIndex);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

export function resolveThreadBlockId(
  thread: CommentThreadDto,
  flatBlocks: readonly FlatEditorBlock[],
  pinnedBlockId: string | undefined,
): string | null {
  if (flatBlocks.length === 0) return null;
  if (pinnedBlockId && flatBlocks.some((block) => block.id === pinnedBlockId)) {
    return pinnedBlockId;
  }

  const normalizedQuote = thread.quote.trim();
  if (normalizedQuote.length > 0) {
    const exactTypeMatches = flatBlocks.filter(
      (b) => b.type === thread.blockType && b.text === normalizedQuote,
    );
    const closestExactType = pickClosestByIndex(exactTypeMatches, thread.blockIndex);
    if (closestExactType) return closestExactType.id;

    const exactTextMatches = flatBlocks.filter((b) => b.text === normalizedQuote);
    const closestExactText = pickClosestByIndex(exactTextMatches, thread.blockIndex);
    if (closestExactText) return closestExactText.id;

    const snippet = normalizedQuote.slice(0, 36);
    if (snippet.length >= 4) {
      const partialMatches = flatBlocks.filter(
        (b) => b.text.includes(snippet) || snippet.includes(b.text),
      );
      const closestPartial = pickClosestByIndex(partialMatches, thread.blockIndex);
      if (closestPartial) return closestPartial.id;
    }
  }

  const fallbackIndex = Math.max(0, Math.min(thread.blockIndex, flatBlocks.length - 1));
  return flatBlocks[fallbackIndex]?.id ?? null;
}

function getBlockContainerElement(container: HTMLElement, blockId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `[data-node-type="blockContainer"][data-id="${CSS.escape(blockId)}"]`,
  );
}

function formatRelativeTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d`;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
      new Date(timestamp),
    );
  } catch {
    return "";
  }
}

function getAuthorInitial(name: string, email: string): string {
  const source = (name || email || "?").trim();
  return source.charAt(0).toUpperCase();
}

function getCardSortOrder(item: RailCardInput): number {
  return item.top;
}

export type CommentDisplayMode = "collapsed" | "expanded";

const COMMENT_DISPLAY_MODE_KEY = "merak:comment-display-mode";

export function loadCommentDisplayMode(): CommentDisplayMode {
  try {
    return window.localStorage.getItem(COMMENT_DISPLAY_MODE_KEY) === "expanded"
      ? "expanded"
      : "collapsed";
  } catch {
    return "collapsed";
  }
}

export function saveCommentDisplayMode(mode: CommentDisplayMode): void {
  try {
    window.localStorage.setItem(COMMENT_DISPLAY_MODE_KEY, mode);
  } catch {
    // Ignore storage quota errors in restricted browsing modes.
  }
}

interface BlockRectMetric {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface CanvasGeometry {
  canvasWidth: number;
  editorRight: number;
  blockMetrics: Map<string, BlockRectMetric>;
}

interface RailCardInput {
  key: string;
  kind: "composer" | "thread";
  blockId: string;
  top: number;
  thread?: CommentThreadDto;
}

interface PlacedRailCard extends RailCardInput {
  placedTop: number;
}

const CARD_WIDTH = 284;
const CARD_MIN_ESTIMATED_HEIGHT = 116;
const CARD_VERTICAL_GAP = 10;
const WIDE_RAIL_MIN_WIDTH = 1020;

interface ThreadCardProps {
  thread: CommentThreadDto;
  isActive: boolean;
  readOnly: boolean;
  currentUserId: string | null;
  currentUserName?: string;
  currentUserEmail?: string;
  currentUserImage?: string | null;
  showQuote?: boolean;
  showInlineComposerAvatar?: boolean;
  onActivate: () => void;
  onHoverChange: (hovered: boolean) => void;
  onReply: (threadId: string, body: string) => Promise<void>;
  onResolveToggle: (thread: CommentThreadDto) => Promise<void>;
  onEditMessage: (threadId: string, messageId: string, body: string) => Promise<void>;
  onDeleteMessage: (threadId: string, messageId: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onEscapeClose?: () => void;
  onHeightChange?: (threadId: string, height: number) => void;
}

function CommentThreadCard({
  thread,
  isActive,
  readOnly,
  currentUserId,
  currentUserName = "You",
  currentUserEmail = "",
  currentUserImage = null,
  showQuote = false,
  showInlineComposerAvatar = false,
  onActivate,
  onHoverChange,
  onReply,
  onResolveToggle,
  onEditMessage,
  onDeleteMessage,
  onDeleteThread,
  onEscapeClose,
  onHeightChange,
}: ThreadCardProps) {
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !onHeightChange) return;
    onHeightChange(thread.id, el.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        onHeightChange(thread.id, entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange, thread.id, isActive, thread.messages.length, editingMessageId]);

  const handleSubmitReply = useCallback(async () => {
    const body = replyText.trim();
    if (!body || isSubmittingReply || readOnly) return;
    setIsSubmittingReply(true);
    try {
      await onReply(thread.id, body);
      setReplyText("");
    } finally {
      setIsSubmittingReply(false);
    }
  }, [isSubmittingReply, onReply, readOnly, replyText, thread.id]);

  const handleReplyKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSubmitReply();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (onEscapeClose) {
          onEscapeClose();
        } else {
          event.currentTarget.blur();
        }
      }
    },
    [handleSubmitReply, onEscapeClose],
  );

  const startEdit = useCallback((message: CommentMessageDto) => {
    setEditingMessageId(message.id);
    setEditDraft(message.body);
  }, []);

  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      const nextBody = editDraft.trim();
      if (!nextBody || isSavingEdit) return;
      setIsSavingEdit(true);
      try {
        await onEditMessage(thread.id, messageId, nextBody);
        setEditingMessageId(null);
      } finally {
        setIsSavingEdit(false);
      }
    },
    [editDraft, isSavingEdit, onEditMessage, thread.id],
  );

  return (
    <div
      ref={cardRef}
      className="merak-comment-card"
      data-active={isActive ? "true" : undefined}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
    >
      <div className="merak-comment-messages">
        {thread.messages.map((message, idx) => {
          const isFirst = idx === 0;
          const isOwn = currentUserId !== null && message.author.id === currentUserId;
          const isEditing = editingMessageId === message.id;

          return (
            <div key={message.id} className="merak-comment-message">
              <div className="merak-comment-header">
                <div className="merak-comment-author-row">
                  <span className="merak-comment-avatar" aria-hidden="true">
                    {message.author.image ? (
                      <img src={message.author.image} alt="" className="merak-comment-avatar-img" />
                    ) : (
                      getAuthorInitial(message.author.name, message.author.email)
                    )}
                  </span>
                  <span className="merak-comment-author">{message.author.name}</span>
                  <span className="merak-comment-time">{formatRelativeTime(message.createdAt)}</span>
                </div>

                {!readOnly ? (
                  <div className="merak-comment-actions">
                    {isOwn && !isEditing ? (
                      <>
                        <button
                          type="button"
                          className="merak-comment-action-btn"
                          aria-label="Edit comment"
                          title="Edit"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(message);
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          className="merak-comment-action-btn"
                          aria-label="Delete comment"
                          title="Delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onDeleteMessage(thread.id, message.id);
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    ) : null}

                    {isFirst ? (
                      <button
                        type="button"
                        className="merak-comment-action-btn"
                        aria-label={thread.status === "resolved" ? "Reopen comment" : "Resolve comment"}
                        title={thread.status === "resolved" ? "Reopen" : "Resolve"}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onResolveToggle(thread);
                        }}
                      >
                        {thread.status === "resolved" ? <RotateCcw size={12} /> : <Check size={13} />}
                      </button>
                    ) : null}

                    {isFirst && !isOwn && currentUserId !== null && thread.createdBy === currentUserId ? (
                      <button
                        type="button"
                        className="merak-comment-action-btn"
                        aria-label="Delete thread"
                        title="Delete thread"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleteThread(thread.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {isFirst && showQuote && thread.quote ? (
                <div className="merak-comment-quote">{thread.quote}</div>
              ) : null}

              {isEditing ? (
                <div className="merak-comment-edit-box" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    className="merak-comment-textarea"
                    rows={2}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.nativeEvent.isComposing) return;
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSaveEdit(message.id);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingMessageId(null);
                      }
                    }}
                  />
                  <div className="merak-comment-edit-actions">
                    <button
                      type="button"
                      className="merak-comment-mini-btn"
                      onClick={() => setEditingMessageId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="merak-comment-mini-btn"
                      data-primary="true"
                      disabled={editDraft.trim().length === 0 || isSavingEdit}
                      onClick={() => void handleSaveEdit(message.id)}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="merak-comment-body">{message.body}</p>
              )}
            </div>
          );
        })}
      </div>

      {isActive && !readOnly && thread.status === "open" ? (
        <div className="merak-comment-reply-row" onClick={(e) => e.stopPropagation()}>
          {showInlineComposerAvatar ? (
            <span className="merak-comment-avatar" aria-hidden="true">
              {currentUserImage ? (
                <img src={currentUserImage} alt="" className="merak-comment-avatar-img" />
              ) : (
                getAuthorInitial(currentUserName, currentUserEmail)
              )}
            </span>
          ) : null}
          <textarea
            ref={replyInputRef}
            className="merak-comment-textarea"
            rows={1}
            placeholder={showInlineComposerAvatar ? "Add a comment..." : "Reply..."}
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            onKeyDown={handleReplyKeyDown}
          />
          <button
            type="button"
            className="merak-comment-send-btn"
            aria-label="Send reply"
            disabled={replyText.trim().length === 0 || isSubmittingReply}
            onClick={() => void handleSubmitReply()}
          >
            <ArrowUp size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ComposerCardProps {
  theme: "light" | "dark";
  authorName: string;
  authorEmail: string;
  authorImage: string | null;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  onHeightChange?: (height: number) => void;
}

function CommentComposerCard({
  authorName,
  authorEmail,
  authorImage,
  onSubmit,
  onCancel,
  onHeightChange,
}: ComposerCardProps) {
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !onHeightChange) return;
    onHeightChange(el.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        onHeightChange(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);

  const handleSubmit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setBody("");
    } finally {
      setIsSubmitting(false);
    }
  }, [body, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  return (
    <div
      ref={cardRef}
      className="merak-comment-card merak-comment-composer"
      data-active="true"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="merak-comment-composer-row">
        <span className="merak-comment-avatar" aria-hidden="true">
          {authorImage ? (
            <img src={authorImage} alt="" className="merak-comment-avatar-img" />
          ) : (
            getAuthorInitial(authorName, authorEmail)
          )}
        </span>
        <textarea
          ref={textareaRef}
          className="merak-comment-textarea"
          rows={1}
          placeholder="Add a comment..."
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="merak-comment-send-btn"
          aria-label="Submit comment"
          disabled={body.trim().length === 0 || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          <ArrowUp size={13} />
        </button>
        <button
          type="button"
          className="merak-comment-action-btn"
          aria-label="Cancel comment"
          onClick={onCancel}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

export interface MarkdownBlockCommentsProps {
  nodeId: string;
  readOnly: boolean;
  fullWidth: boolean;
  displayMode: CommentDisplayMode;
  theme: "light" | "dark";
  docRevision: number;
  getDocumentBlocks: () => readonly EditorBlockWithId[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  activeThreadId: string | null;
  onActiveThreadIdChange: (threadId: string | null) => void;
  onRailActiveChange: (active: boolean) => void;
}

export function MarkdownBlockComments({
  nodeId,
  readOnly,
  fullWidth,
  displayMode,
  theme,
  docRevision,
  getDocumentBlocks,
  scrollContainerRef,
  canvasRef,
  activeThreadId,
  onActiveThreadIdChange,
  onRailActiveChange,
}: MarkdownBlockCommentsProps) {
  const queryClient = useQueryClient();
  const session = useSession();
  const currentUser = session.data?.user ?? null;

  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [composerBlockId, setComposerBlockId] = useState<string | null>(null);
  const [openPopoverBlockId, setOpenPopoverBlockId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [geometry, setGeometry] = useState<CanvasGeometry>({
    canvasWidth: 0,
    editorRight: 0,
    blockMetrics: new Map(),
  });
  const [cardHeights, setCardHeights] = useState<Map<string, number>>(() => new Map());

  const pinnedBlockMapRef = useRef<Map<string, string>>(new Map());
  const hideHoverTimerRef = useRef<number | null>(null);

  useEffect(() => {
    pinnedBlockMapRef.current.clear();
    setHoveredBlockId(null);
    setHoveredThreadId(null);
    setComposerBlockId(null);
    setOpenPopoverBlockId(null);
    onActiveThreadIdChange(null);
  }, [nodeId, onActiveThreadIdChange]);

  const commentsQuery = useQuery({
    queryKey: workspaceQueryKeys.comments(nodeId),
    queryFn: () => fetchNodeComments(nodeId, { includeResolved: true }),
    staleTime: 15_000,
  });

  const openThreads = useMemo(
    () => (commentsQuery.data ?? []).filter((thread) => thread.status === "open"),
    [commentsQuery.data],
  );

  const flatBlocks = useMemo(
    () => flattenEditorBlocks(getDocumentBlocks()),
    // docRevision captures live BlockNote updates without requiring editor reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docRevision, getDocumentBlocks],
  );

  const flatBlockById = useMemo(() => {
    const map = new Map<string, FlatEditorBlock>();
    for (const block of flatBlocks) {
      map.set(block.id, block);
    }
    return map;
  }, [flatBlocks]);

  const threadAnchors = useMemo(() => {
    const byBlock = new Map<string, CommentThreadDto[]>();
    const threadToBlock = new Map<string, string>();
    for (const thread of openThreads) {
      const resolvedBlockId = resolveThreadBlockId(
        thread,
        flatBlocks,
        pinnedBlockMapRef.current.get(thread.id),
      );
      if (!resolvedBlockId) continue;
      pinnedBlockMapRef.current.set(thread.id, resolvedBlockId);
      threadToBlock.set(thread.id, resolvedBlockId);
      const list = byBlock.get(resolvedBlockId) ?? [];
      list.push(thread);
      byBlock.set(resolvedBlockId, list);
    }
    return { byBlock, threadToBlock };
  }, [flatBlocks, openThreads]);

  const canUseSideRail =
    displayMode === "expanded" && containerWidth >= WIDE_RAIL_MIN_WIDTH && !fullWidth;

  const showSideRail =
    canUseSideRail && (openThreads.length > 0 || composerBlockId !== null);

  useEffect(() => {
    onRailActiveChange(showSideRail);
  }, [onRailActiveChange, showSideRail]);

  useEffect(() => {
    if (showSideRail) {
      setOpenPopoverBlockId(null);
    }
  }, [showSideRail]);

  const measureGeometry = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const canvasEl = canvasRef.current;
    if (!scrollEl || !canvasEl) return;

    setContainerWidth((prev) =>
      prev === scrollEl.clientWidth ? prev : scrollEl.clientWidth,
    );

    const canvasRect = canvasEl.getBoundingClientRect();
    const bnEditor = canvasEl.querySelector<HTMLElement>(".bn-editor");
    const editorRight = bnEditor
      ? bnEditor.getBoundingClientRect().right - canvasRect.left
      : canvasRect.width;

    const nextMetrics = new Map<string, BlockRectMetric>();
    const nodes = canvasEl.querySelectorAll<HTMLElement>(
      '[data-node-type="blockContainer"][data-id]',
    );
    for (const el of nodes) {
      const id = el.getAttribute("data-id");
      if (!id) continue;
      const r = el.getBoundingClientRect();
      nextMetrics.set(id, {
        top: r.top - canvasRect.top,
        bottom: r.bottom - canvasRect.top,
        left: r.left - canvasRect.left,
        right: r.right - canvasRect.left,
      });
    }

    setGeometry({
      canvasWidth: canvasEl.clientWidth,
      editorRight,
      blockMetrics: nextMetrics,
    });
  }, [canvasRef, scrollContainerRef]);

  // Measure initially, on resize, on document revisions, and across rail shift animation
  useEffect(() => {
    measureGeometry();
    const raf = window.requestAnimationFrame(() => measureGeometry());

    const scrollEl = scrollContainerRef.current;
    const canvasEl = canvasRef.current;
    const bnEditor = canvasEl?.querySelector<HTMLElement>(".bn-editor") ?? null;

    const resizeObserver = new ResizeObserver(() => {
      measureGeometry();
    });
    if (scrollEl) resizeObserver.observe(scrollEl);
    if (canvasEl) resizeObserver.observe(canvasEl);
    if (bnEditor) resizeObserver.observe(bnEditor);

    const handleTransitionEnd = () => measureGeometry();
    canvasEl?.addEventListener("transitionend", handleTransitionEnd);

    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvasEl?.removeEventListener("transitionend", handleTransitionEnd);
    };
  }, [
    canvasRef,
    docRevision,
    measureGeometry,
    openThreads.length,
    composerBlockId,
    scrollContainerRef,
    showSideRail,
  ]);

  // Animate geometry updates cleanly while padding-inline-end shifts the editor column
  useEffect(() => {
    let rafId: number | null = null;
    const start = performance.now();
    const step = () => {
      measureGeometry();
      if (performance.now() - start < 240) {
        rafId = window.requestAnimationFrame(step);
      }
    };
    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [showSideRail, measureGeometry]);

  // Apply Notion amber highlight attributes onto commented blocks
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const commentedIds = new Set<string>(threadAnchors.byBlock.keys());
    if (composerBlockId) {
      commentedIds.add(composerBlockId);
    }

    const activeBlockIds = new Set<string>();
    if (composerBlockId) activeBlockIds.add(composerBlockId);
    if (openPopoverBlockId) activeBlockIds.add(openPopoverBlockId);
    if (activeThreadId) {
      const id = threadAnchors.threadToBlock.get(activeThreadId);
      if (id) activeBlockIds.add(id);
    }
    if (hoveredThreadId) {
      const id = threadAnchors.threadToBlock.get(hoveredThreadId);
      if (id) activeBlockIds.add(id);
    }

    const blocks = canvasEl.querySelectorAll<HTMLElement>('[data-node-type="blockContainer"][data-id]');
    for (const block of blocks) {
      const id = block.getAttribute("data-id");
      if (id && commentedIds.has(id)) {
        block.setAttribute("data-merak-commented", "true");
        if (activeBlockIds.has(id)) {
          block.setAttribute("data-merak-comment-active", "true");
        } else {
          block.removeAttribute("data-merak-comment-active");
        }
      } else {
        block.removeAttribute("data-merak-commented");
        block.removeAttribute("data-merak-comment-active");
      }
    }
  }, [
    activeThreadId,
    canvasRef,
    composerBlockId,
    docRevision,
    hoveredThreadId,
    openPopoverBlockId,
    threadAnchors,
  ]);

  // Fold floating popover & clear active highlight when clicking outside comments/commented blocks
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-merak-comments="true"]')) {
        if (hideHoverTimerRef.current !== null) {
          window.clearTimeout(hideHoverTimerRef.current);
          hideHoverTimerRef.current = null;
        }
        return;
      }

      const block = target.closest<HTMLElement>('[data-node-type="blockContainer"][data-id]');
      const nextId = block?.getAttribute("data-id") ?? null;
      if (hideHoverTimerRef.current !== null) {
        window.clearTimeout(hideHoverTimerRef.current);
        hideHoverTimerRef.current = null;
      }
      setHoveredBlockId((prev) => (prev === nextId ? prev : nextId));
    };

    const handlePointerLeave = () => {
      if (hideHoverTimerRef.current !== null) {
        window.clearTimeout(hideHoverTimerRef.current);
      }
      hideHoverTimerRef.current = window.setTimeout(() => {
        hideHoverTimerRef.current = null;
        setHoveredBlockId(null);
      }, 120);
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('[data-merak-comments="true"]')) return;
      const block = target.closest<HTMLElement>('[data-node-type="blockContainer"][data-id]');
      const blockId = block?.getAttribute("data-id");
      if (blockId) {
        const blockThreads = threadAnchors.byBlock.get(blockId);
        if (blockThreads && blockThreads.length > 0 && blockThreads[0]) {
          setComposerBlockId(null);
          onActiveThreadIdChange(blockThreads[0].id);
          if (!canUseSideRail) {
            setOpenPopoverBlockId(blockId);
          }
          return;
        }
      }
      onActiveThreadIdChange(null);
      setOpenPopoverBlockId(null);
      setComposerBlockId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openPopoverBlockId !== null || composerBlockId !== null) {
        setOpenPopoverBlockId(null);
        setComposerBlockId(null);
      }
    };

    scrollEl.addEventListener("pointermove", handlePointerMove);
    scrollEl.addEventListener("pointerleave", handlePointerLeave);
    scrollEl.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (hideHoverTimerRef.current !== null) {
        window.clearTimeout(hideHoverTimerRef.current);
      }
      scrollEl.removeEventListener("pointermove", handlePointerMove);
      scrollEl.removeEventListener("pointerleave", handlePointerLeave);
      scrollEl.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    canUseSideRail,
    composerBlockId,
    onActiveThreadIdChange,
    openPopoverBlockId,
    scrollContainerRef,
    threadAnchors.byBlock,
  ]);

  // Scroll commented block into view and open floating card in collapsed mode when toolbar selects a thread
  useEffect(() => {
    if (!activeThreadId) return;
    const blockId = threadAnchors.threadToBlock.get(activeThreadId);
    const scrollEl = scrollContainerRef.current;
    if (!blockId || !scrollEl) return;
    if (!canUseSideRail) {
      setOpenPopoverBlockId(blockId);
    }
    const el = getBlockContainerElement(scrollEl, blockId);
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    if (elRect.top < scrollRect.top + 24 || elRect.bottom > scrollRect.bottom - 24) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeThreadId, canUseSideRail, scrollContainerRef, threadAnchors.threadToBlock]);

  const updateCardHeight = useCallback((key: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    setCardHeights((prev) => {
      const existing = prev.get(key);
      if (existing !== undefined && Math.abs(existing - height) < 1) return prev;
      const next = new Map(prev);
      next.set(key, height);
      return next;
    });
  }, []);

  const invalidateComments = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.comments(nodeId) });
  }, [nodeId, queryClient]);

  const handleOpenComposerForBlock = useCallback(
    (blockId: string) => {
      if (readOnly) return;
      onActiveThreadIdChange(null);
      setComposerBlockId(blockId);
      if (!canUseSideRail) {
        setOpenPopoverBlockId(blockId);
      }
    },
    [canUseSideRail, onActiveThreadIdChange, readOnly],
  );

  const handleCreateComment = useCallback(
    async (body: string) => {
      const targetBlockId = composerBlockId;
      if (!targetBlockId) return;
      const blockMeta = flatBlockById.get(targetBlockId);
      const created = await createCommentThread(nodeId, {
        blockIndex: blockMeta?.index ?? 0,
        blockType: blockMeta?.type ?? "paragraph",
        quote: blockMeta?.text ?? "",
        body,
      });
      pinnedBlockMapRef.current.set(created.id, targetBlockId);
      setComposerBlockId(null);
      onActiveThreadIdChange(created.id);
      if (!canUseSideRail) {
        setOpenPopoverBlockId(targetBlockId);
      }
      await invalidateComments();
    },
    [canUseSideRail, composerBlockId, flatBlockById, invalidateComments, nodeId, onActiveThreadIdChange],
  );

  const handleReply = useCallback(
    async (threadId: string, body: string) => {
      await replyCommentThread(nodeId, threadId, { body });
      await invalidateComments();
    },
    [invalidateComments, nodeId],
  );

  const handleResolveToggle = useCallback(
    async (thread: CommentThreadDto) => {
      const nextStatus = thread.status === "resolved" ? "open" : "resolved";
      await updateCommentThread(nodeId, thread.id, { status: nextStatus });
      if (nextStatus === "resolved" && activeThreadId === thread.id) {
        onActiveThreadIdChange(null);
      }
      await invalidateComments();
    },
    [activeThreadId, invalidateComments, nodeId, onActiveThreadIdChange],
  );

  const handleEditMessage = useCallback(
    async (threadId: string, messageId: string, body: string) => {
      await updateCommentMessage(nodeId, threadId, messageId, { body });
      await invalidateComments();
    },
    [invalidateComments, nodeId],
  );

  const handleDeleteMessage = useCallback(
    async (threadId: string, messageId: string) => {
      const res = await deleteCommentMessage(nodeId, threadId, messageId);
      if (res.threadDeleted && activeThreadId === threadId) {
        onActiveThreadIdChange(null);
      }
      await invalidateComments();
    },
    [activeThreadId, invalidateComments, nodeId, onActiveThreadIdChange],
  );

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      await deleteCommentThread(nodeId, threadId);
      if (activeThreadId === threadId) {
        onActiveThreadIdChange(null);
      }
      await invalidateComments();
    },
    [activeThreadId, invalidateComments, nodeId, onActiveThreadIdChange],
  );

  const placedRailCards = useMemo((): PlacedRailCard[] => {
    if (!showSideRail) return [];
    const items: RailCardInput[] = [];

    for (const thread of openThreads) {
      const blockId = threadAnchors.threadToBlock.get(thread.id);
      if (!blockId) continue;
      const metric = geometry.blockMetrics.get(blockId);
      if (!metric) continue;
      items.push({
        key: thread.id,
        kind: "thread",
        blockId,
        top: Math.max(20, metric.top - 4),
        thread,
      });
    }

    if (composerBlockId) {
      const metric = geometry.blockMetrics.get(composerBlockId);
      if (metric) {
        items.push({
          key: "__composer__",
          kind: "composer",
          blockId: composerBlockId,
          top: Math.max(20, metric.top - 4),
        });
      }
    }

    items.sort((a, b) => getCardSortOrder(a) - getCardSortOrder(b));

    let cursorY = 0;
    return items.map((item) => {
      const placedTop = Math.max(item.top, cursorY);
      const measuredHeight = cardHeights.get(item.key) ?? CARD_MIN_ESTIMATED_HEIGHT;
      cursorY = placedTop + measuredHeight + CARD_VERTICAL_GAP;
      return { ...item, placedTop };
    });
  }, [
    cardHeights,
    composerBlockId,
    geometry.blockMetrics,
    openThreads,
    showSideRail,
    threadAnchors.threadToBlock,
  ]);

  const railLeft = useMemo(() => {
    if (!showSideRail || geometry.canvasWidth <= 0) return 0;
    const preferredLeft = geometry.editorRight - 22;
    const maxSafeLeft = Math.max(24, geometry.canvasWidth - CARD_WIDTH - 48);
    return Math.min(preferredLeft, maxSafeLeft);
  }, [geometry.canvasWidth, geometry.editorRight, showSideRail]);

  const hoveredMetric = hoveredBlockId ? geometry.blockMetrics.get(hoveredBlockId) : undefined;
  const hoveredHasThreads =
    hoveredBlockId !== null && (threadAnchors.byBlock.get(hoveredBlockId)?.length ?? 0) > 0;
  const showAddButton =
    !readOnly &&
    hoveredBlockId !== null &&
    hoveredMetric !== undefined &&
    composerBlockId !== hoveredBlockId &&
    (showSideRail || !hoveredHasThreads);

  const floatingBlockId = !showSideRail ? (openPopoverBlockId ?? composerBlockId) : null;
  const floatingMetric = floatingBlockId ? geometry.blockMetrics.get(floatingBlockId) : undefined;
  const floatingThreads = floatingBlockId ? threadAnchors.byBlock.get(floatingBlockId) ?? [] : [];
  const showFloatingPopover =
    floatingBlockId !== null &&
    floatingMetric !== undefined &&
    (composerBlockId === floatingBlockId || floatingThreads.length > 0);

  const floatingStyle = useMemo((): CSSProperties | undefined => {
    if (!floatingMetric) return undefined;
    const width = Math.min(372, Math.max(240, geometry.canvasWidth - 32));
    const maxLeft = Math.max(16, geometry.canvasWidth - width - 16);
    const left = Math.min(Math.max(16, floatingMetric.left + 28), maxLeft);
    return {
      top: `${Math.max(8, floatingMetric.bottom + 8)}px`,
      left: `${left}px`,
      width: `${width}px`,
    };
  }, [floatingMetric, geometry.canvasWidth]);

  return (
    <div
      className="merak-comments-root"
      data-merak-comments="true"
      data-merak-theme={theme}
    >
      {showAddButton && hoveredBlockId && hoveredMetric ? (
        <button
          type="button"
          className="merak-comment-add-btn"
          aria-label="Add comment"
          title="Comment"
          style={{
            top: `${Math.max(4, hoveredMetric.top + 3)}px`,
            left: `${hoveredMetric.right + 10}px`,
          }}
          onMouseEnter={() => {
            if (hideHoverTimerRef.current !== null) {
              window.clearTimeout(hideHoverTimerRef.current);
              hideHoverTimerRef.current = null;
            }
          }}
          onClick={(event) => {
            event.stopPropagation();
            handleOpenComposerForBlock(hoveredBlockId);
          }}
        >
          <MessageSquarePlus size={15} />
        </button>
      ) : null}

      {!showSideRail
        ? Array.from(threadAnchors.byBlock.entries()).map(([blockId, blockThreads]) => {
            const metric = geometry.blockMetrics.get(blockId);
            if (!metric || blockThreads.length === 0) return null;
            const firstThread = blockThreads[0];
            if (!firstThread) return null;
            const isOpen = openPopoverBlockId === blockId;
            return (
              <button
                key={`badge-${blockId}`}
                type="button"
                className="merak-comment-badge-btn"
                data-open={isOpen ? "true" : undefined}
                aria-expanded={isOpen}
                aria-label={`${blockThreads.length} comments on block`}
                style={{
                  top: `${Math.max(4, metric.top + 3)}px`,
                  left: `${metric.right + 10}px`,
                }}
                onMouseEnter={() => setHoveredThreadId(firstThread.id)}
                onMouseLeave={() => setHoveredThreadId(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  setComposerBlockId(null);
                  if (isOpen) {
                    setOpenPopoverBlockId(null);
                    onActiveThreadIdChange(null);
                  } else {
                    setOpenPopoverBlockId(blockId);
                    onActiveThreadIdChange(firstThread.id);
                  }
                }}
              >
                <MessageSquare size={14} />
                <span>{blockThreads.length}</span>
              </button>
            );
          })
        : null}

      {showSideRail && placedRailCards.length > 0 ? (
        <div
          className="merak-comment-rail"
          style={{ left: `${railLeft}px`, width: `${CARD_WIDTH}px` }}
        >
          {placedRailCards.map((item) => (
            <div
              key={item.key}
              className="merak-comment-rail-slot"
              style={{ transform: `translateY(${item.placedTop}px)` }}
            >
              {item.kind === "composer" ? (
                <CommentComposerCard
                  theme={theme}
                  authorName={currentUser?.name ?? "You"}
                  authorEmail={currentUser?.email ?? ""}
                  authorImage={currentUser?.image ?? null}
                  onSubmit={handleCreateComment}
                  onCancel={() => setComposerBlockId(null)}
                  onHeightChange={(height) => updateCardHeight("__composer__", height)}
                />
              ) : item.thread ? (
                <CommentThreadCard
                  thread={item.thread}
                  isActive={activeThreadId === item.thread.id}
                  readOnly={readOnly}
                  currentUserId={currentUser?.id ?? null}
                  onActivate={() => onActiveThreadIdChange(item.thread!.id)}
                  onHoverChange={(hovered) =>
                    setHoveredThreadId(hovered ? item.thread!.id : null)
                  }
                  onReply={handleReply}
                  onResolveToggle={handleResolveToggle}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onDeleteThread={handleDeleteThread}
                  onHeightChange={updateCardHeight}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {showFloatingPopover && floatingBlockId && floatingStyle ? (
        <div
          className="merak-comment-floating-popover"
          data-merak-comments="true"
          data-merak-theme={theme}
          style={floatingStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {composerBlockId === floatingBlockId ? (
            <CommentComposerCard
              theme={theme}
              authorName={currentUser?.name ?? "You"}
              authorEmail={currentUser?.email ?? ""}
              authorImage={currentUser?.image ?? null}
              onSubmit={handleCreateComment}
              onCancel={() => {
                setComposerBlockId(null);
                setOpenPopoverBlockId(null);
              }}
            />
          ) : (
            <div className="merak-comments-compact-list">
              {floatingThreads.map((thread) => (
                <CommentThreadCard
                  key={thread.id}
                  thread={thread}
                  isActive={true}
                  readOnly={readOnly}
                  currentUserId={currentUser?.id ?? null}
                  currentUserName={currentUser?.name ?? "You"}
                  currentUserEmail={currentUser?.email ?? ""}
                  currentUserImage={currentUser?.image ?? null}
                  showQuote={true}
                  showInlineComposerAvatar={true}
                  onActivate={() => onActiveThreadIdChange(thread.id)}
                  onHoverChange={(hovered) => setHoveredThreadId(hovered ? thread.id : null)}
                  onReply={handleReply}
                  onResolveToggle={async (t) => {
                    await handleResolveToggle(t);
                    if (floatingThreads.length <= 1) {
                      setOpenPopoverBlockId(null);
                    }
                  }}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onDeleteThread={handleDeleteThread}
                  onEscapeClose={() => {
                    setOpenPopoverBlockId(null);
                    onActiveThreadIdChange(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export interface MarkdownCommentsToolbarButtonProps {
  nodeId: string;
  readOnly: boolean;
  displayMode: CommentDisplayMode;
  onDisplayModeChange: (mode: CommentDisplayMode) => void;
  theme: "light" | "dark";
  onSelectThread: (threadId: string) => void;
}

export function MarkdownCommentsToolbarButton({
  nodeId,
  readOnly,
  displayMode,
  onDisplayModeChange,
  theme,
  onSelectThread,
}: MarkdownCommentsToolbarButtonProps) {
  const popoverId = useId();
  const anchorName = `--merak-comments-trigger-${popoverId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const popoverRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"open" | "resolved">("open");

  const commentsQuery = useQuery({
    queryKey: workspaceQueryKeys.comments(nodeId),
    queryFn: () => fetchNodeComments(nodeId, { includeResolved: true }),
    staleTime: 15_000,
  });

  const threads = commentsQuery.data ?? [];
  const openThreads = useMemo(
    () => threads.filter((thread) => thread.status === "open"),
    [threads],
  );
  const resolvedThreads = useMemo(
    () => threads.filter((thread) => thread.status === "resolved"),
    [threads],
  );

  const visibleThreads = tab === "open" ? openThreads : resolvedThreads;

  const handleToggleStatus = useCallback(
    async (thread: CommentThreadDto) => {
      const nextStatus = thread.status === "resolved" ? "open" : "resolved";
      await updateCommentThread(nodeId, thread.id, { status: nextStatus });
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.comments(nodeId) });
    },
    [nodeId, queryClient],
  );

  const handleJump = useCallback(
    (thread: CommentThreadDto) => {
      onSelectThread(thread.id);
      const el = popoverRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
      el?.hidePopover?.();
    },
    [onSelectThread],
  );

  return (
    <div className="merak-comments-toolbar-wrap" data-merak-comments="true">
      <button
        type="button"
        className="merak-comments-toolbar-btn"
        data-merak-theme={theme}
        aria-label={`Comments (${openThreads.length} open)`}
        popoverTarget={popoverId}
        style={{ anchorName } as CSSProperties}
      >
        <MessageSquare size={14} />
        {openThreads.length > 0 ? (
          <span className="merak-comments-toolbar-count">{openThreads.length}</span>
        ) : null}
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        {...({ popover: "auto" } as Record<string, unknown>)}
        className="merak-comments-popover"
        data-merak-comments="true"
        data-merak-theme={theme}
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        <div className="merak-comments-popover-tabs">
          <div className="merak-comments-popover-tab-group">
            <button
              type="button"
              className="merak-comments-tab-btn"
              data-active={tab === "open" ? "true" : undefined}
              onClick={() => setTab("open")}
            >
              Open ({openThreads.length})
            </button>
            <button
              type="button"
              className="merak-comments-tab-btn"
              data-active={tab === "resolved" ? "true" : undefined}
              onClick={() => setTab("resolved")}
            >
              Resolved ({resolvedThreads.length})
            </button>
          </div>
          <button
            type="button"
            className="merak-comments-tab-btn"
            data-active={displayMode === "expanded" ? "true" : undefined}
            title={
              displayMode === "expanded"
                ? "Collapse comments into inline badges"
                : "Expand comments into right margin rail"
            }
            onClick={() =>
              onDisplayModeChange(displayMode === "expanded" ? "collapsed" : "expanded")
            }
          >
            {displayMode === "expanded" ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
          </button>
        </div>

        <div className="merak-comments-popover-body">
          {visibleThreads.length === 0 ? (
            <div className="merak-comments-empty">
              {tab === "open"
                ? "Hover any block and click the comment icon on the right to start a thread."
                : "No resolved comments yet."}
            </div>
          ) : (
            visibleThreads.map((thread) => {
              const firstMessage = thread.messages[0];
              const replyCount = Math.max(0, thread.messages.length - 1);
              return (
                <div key={thread.id} className="merak-comments-history-item">
                  <button
                    type="button"
                    className="merak-comments-history-main"
                    onClick={() => handleJump(thread)}
                  >
                    {thread.quote ? (
                      <div className="merak-comments-history-quote">{thread.quote}</div>
                    ) : null}
                    <div className="merak-comments-history-meta">
                      <span className="merak-comment-author">
                        {firstMessage?.author.name ?? "Comment"}
                      </span>
                      <span className="merak-comment-time">
                        {formatRelativeTime(thread.updatedAt)}
                      </span>
                      {replyCount > 0 ? (
                        <span className="merak-comment-time">
                          {replyCount} {replyCount === 1 ? "reply" : "replies"}
                        </span>
                      ) : null}
                    </div>
                    <div className="merak-comments-history-text">
                      {firstMessage?.body ?? ""}
                    </div>
                  </button>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="merak-comment-action-btn"
                      aria-label={thread.status === "resolved" ? "Reopen" : "Resolve"}
                      title={thread.status === "resolved" ? "Reopen" : "Resolve"}
                      onClick={() => void handleToggleStatus(thread)}
                    >
                      {thread.status === "resolved" ? <RotateCcw size={13} /> : <Check size={13} />}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
