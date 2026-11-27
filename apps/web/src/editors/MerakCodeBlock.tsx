import { createCodeBlockSpec } from "@blocknote/core";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { Popover, PopoverContent, PopoverTrigger, toast } from "@merak/ui";
import { colors, font, radius, shadow } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Check,
  ChevronDown,
  Copy,
  CopyPlus,
  CornerDownLeft,
  Ellipsis,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneBlocksForDuplicate } from "./blockSelection.js";
import {
  extractCodeBlockText,
  filterCodeLanguages,
  getCodeLanguageLabel,
  MERAK_SUPPORTED_LANGUAGES,
  normalizeCodeLanguage,
} from "./codeBlockLanguages.js";

const baseCodeBlockSpec = createCodeBlockSpec({
  defaultLanguage: "text",
  indentLineWithTab: true,
  supportedLanguages: MERAK_SUPPORTED_LANGUAGES,
});

const styles = stylex.create({
  capsuleDivider: {
    width: "1px",
    height: "16px",
    marginLeft: "4px",
    marginRight: "4px",
    backgroundColor: colors.border,
    flexShrink: 0,
  },
  langTrigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    height: "24px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "6px",
    paddingRight: "6px",
    borderWidth: 0,
    borderRadius: "4px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: "inherit",
    fontFamily: font.sans,
    fontSize: "12px",
    fontWeight: 400,
    lineHeight: "16px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  langStaticLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    height: "24px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "6px",
    paddingRight: "6px",
    borderRadius: "4px",
    fontFamily: font.sans,
    fontSize: "12px",
    fontWeight: 400,
    lineHeight: "16px",
    color: "inherit",
    whiteSpace: "nowrap",
  },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderWidth: 0,
    borderRadius: "4px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: "inherit",
    cursor: "pointer",
    flexShrink: 0,
  },
  iconBtnActive: {
    backgroundColor: colors.bgHover,
    color: colors.text,
  },
  popoverReset: {
    gap: 0,
    rowGap: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    boxShadow: "none",
  },
  langCard: {
    width: "220px",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    rowGap: 0,
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "4px",
    paddingRight: "4px",
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.lg,
  },
  moreCard: {
    width: "184px",
    display: "flex",
    flexDirection: "column",
    gap: 0,
    rowGap: 0,
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "4px",
    paddingRight: "4px",
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.lg,
  },
  searchWrap: {
    paddingTop: "2px",
    paddingBottom: "6px",
    paddingLeft: "4px",
    paddingRight: "4px",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: "28px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "8px",
    paddingRight: "8px",
    borderRadius: radius.sm,
    backgroundColor: colors.bgSubtle,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    color: colors.textMuted,
  },
  searchInput: {
    width: "100%",
    minWidth: 0,
    borderWidth: 0,
    outline: "none",
    backgroundColor: "transparent",
    color: colors.text,
    fontFamily: font.sans,
    fontSize: "12.5px",
    lineHeight: "18px",
  },
  scrollList: {
    maxHeight: "240px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  emptyState: {
    paddingTop: "10px",
    paddingBottom: "10px",
    paddingLeft: "8px",
    paddingRight: "8px",
    fontFamily: font.sans,
    fontSize: "12px",
    color: colors.textMuted,
    textAlign: "center",
  },
  menuRow: {
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
  menuRowHighlighted: {
    backgroundColor: colors.bgHover,
  },
  menuRowDanger: {
    color: {
      default: colors.danger,
      ":hover": colors.danger,
    },
  },
  menuRowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
    flex: "1 1 auto",
  },
  menuIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.textMuted,
    flexShrink: 0,
  },
  menuDangerIcon: {
    color: colors.danger,
  },
  menuLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuCheck: {
    display: "inline-flex",
    alignItems: "center",
    color: colors.textMuted,
    flexShrink: 0,
  },
  menuDivider: {
    height: "1px",
    marginTop: "4px",
    marginBottom: "4px",
    marginLeft: "2px",
    marginRight: "2px",
    backgroundColor: colors.borderSubtle,
  },
});

async function writeTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) {
    throw new Error("Copy command rejected");
  }
}

function MerakCodeBlockView({
  block,
  editor,
  contentRef,
}: ReactCustomBlockRenderProps<typeof baseCodeBlockSpec.config>) {
  const [wrapped, setWrapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [langQuery, setLangQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  const codeElRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const setCodeRef = useCallback(
    (node: HTMLElement | null) => {
      codeElRef.current = node;
      contentRef(node);
    },
    [contentRef],
  );

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const currentLangId = useMemo(
    () => normalizeCodeLanguage(block.props.language),
    [block.props.language],
  );
  const currentLangLabel = useMemo(
    () => getCodeLanguageLabel(block.props.language),
    [block.props.language],
  );
  const filteredLanguages = useMemo(() => filterCodeLanguages(langQuery), [langQuery]);

  useEffect(() => {
    if (!langOpen) return;
    const activeIdx = filteredLanguages.findIndex((lang) => lang.id === currentLangId);
    setHighlightedIndex(activeIdx >= 0 ? activeIdx : 0);
  }, [currentLangId, filteredLanguages, langOpen]);

  const handleSelectLanguage = useCallback(
    (langId: string) => {
      if (editor.isEditable) {
        editor.updateBlock(block.id, { props: { language: langId } });
      }
      setLangOpen(false);
      setLangQuery("");
    },
    [block.id, editor],
  );

  const handleCopy = useCallback(async () => {
    const liveBlock = editor.getBlock(block.id);
    const codeText = extractCodeBlockText(
      liveBlock?.content ?? block.content,
      codeElRef.current?.textContent ?? "",
    );
    try {
      await writeTextToClipboard(codeText);
      setCopied(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1500);
      toast.success("Copied code");
    } catch {
      toast.error("Failed to copy code");
    }
  }, [block.content, block.id, editor]);

  const handleDuplicate = useCallback(() => {
    const liveBlock = editor.getBlock(block.id);
    if (!liveBlock) return;
    const clones = cloneBlocksForDuplicate([liveBlock]);
    editor.insertBlocks(
      clones as Parameters<typeof editor.insertBlocks>[0],
      liveBlock.id,
      "after",
    );
    setMoreOpen(false);
  }, [block.id, editor]);

  const handleDelete = useCallback(() => {
    setMoreOpen(false);
    const remaining = editor.document.filter((entry) => entry.id !== block.id);
    if (remaining.length === 0) {
      editor.replaceBlocks(
        [block.id],
        [{ type: "paragraph" }] as unknown as Parameters<typeof editor.replaceBlocks>[1],
      );
    } else {
      editor.removeBlocks([block.id]);
    }
  }, [block.id, editor]);

  const stopEditorMouseDown = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <div
      className="merak-code-block"
      data-code-wrap={wrapped ? "true" : "false"}
      data-menu-open={langOpen || moreOpen ? "true" : "false"}
    >
      <div
        className="merak-code-toolbar"
        contentEditable={false}
        onMouseDown={stopEditorMouseDown}
      >
        {editor.isEditable ? (
          <Popover
            open={langOpen}
            onOpenChange={(nextOpen) => {
              setLangOpen(nextOpen);
              if (nextOpen) {
                setMoreOpen(false);
                setLangQuery("");
              }
            }}
          >
            <PopoverTrigger
              type="button"
              title="Change language"
              data-merak-code-lang-trigger="true"
              {...stylex.props(styles.langTrigger)}
            >
              <span>{currentLangLabel}</span>
              <ChevronDown size={11} strokeWidth={1.75} />
            </PopoverTrigger>

            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={6}
              initialFocus={() => searchInputRef.current}
              data-merak-code-lang-popover="true"
              {...stylex.props(styles.popoverReset)}
            >
              <div {...stylex.props(styles.langCard)}>
                <div {...stylex.props(styles.searchWrap)}>
                  <div {...stylex.props(styles.searchBox)}>
                    <Search size={13} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={langQuery}
                      onChange={(event) => {
                        setLangQuery(event.target.value);
                        setHighlightedIndex(0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setHighlightedIndex((prev) =>
                            filteredLanguages.length === 0
                              ? 0
                              : (prev + 1) % filteredLanguages.length,
                          );
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setHighlightedIndex((prev) =>
                            filteredLanguages.length === 0
                              ? 0
                              : (prev - 1 + filteredLanguages.length) %
                                filteredLanguages.length,
                          );
                        } else if (event.key === "Enter") {
                          const target = filteredLanguages[highlightedIndex];
                          if (target) {
                            event.preventDefault();
                            handleSelectLanguage(target.id);
                          }
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setLangOpen(false);
                        }
                      }}
                      placeholder="Search language..."
                      aria-label="Search code language"
                      {...stylex.props(styles.searchInput)}
                    />
                  </div>
                </div>

                <div {...stylex.props(styles.scrollList)}>
                  {filteredLanguages.length === 0 ? (
                    <div {...stylex.props(styles.emptyState)}>No matching languages</div>
                  ) : (
                    filteredLanguages.map((lang, idx) => {
                      const selected = lang.id === currentLangId;
                      const highlighted = idx === highlightedIndex;
                      return (
                        <button
                          key={lang.id}
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => handleSelectLanguage(lang.id)}
                          {...stylex.props(
                            styles.menuRow,
                            highlighted && styles.menuRowHighlighted,
                          )}
                        >
                          <span {...stylex.props(styles.menuLabel)}>{lang.name}</span>
                          {selected ? (
                            <span {...stylex.props(styles.menuCheck)}>
                              <Check size={13} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span {...stylex.props(styles.langStaticLabel)}>{currentLangLabel}</span>
        )}

        <span {...stylex.props(styles.capsuleDivider)} aria-hidden="true" />

        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? "Copied code" : "Copy code"}
          title={copied ? "Copied" : "Copy"}
          data-merak-code-copy="true"
          {...stylex.props(styles.iconBtn, copied && styles.iconBtnActive)}
        >
          {copied ? <Check size={13} strokeWidth={1.75} /> : <Copy size={13} strokeWidth={1.5} />}
        </button>

        <button
          type="button"
          onClick={() => setWrapped((prev) => !prev)}
          aria-label={wrapped ? "Unwrap code" : "Wrap code"}
          aria-pressed={wrapped}
          title={wrapped ? "Unwrap code" : "Wrap code"}
          data-merak-code-wrap-btn="true"
          {...stylex.props(styles.iconBtn, wrapped && styles.iconBtnActive)}
        >
          <CornerDownLeft size={13} strokeWidth={1.5} />
        </button>

        {editor.isEditable ? (
          <Popover
            open={moreOpen}
            onOpenChange={(nextOpen) => {
              setMoreOpen(nextOpen);
              if (nextOpen) {
                setLangOpen(false);
              }
            }}
          >
            <PopoverTrigger
              type="button"
              aria-label="Code block options"
              title="More options"
              data-merak-code-more-trigger="true"
              {...stylex.props(styles.iconBtn, moreOpen && styles.iconBtnActive)}
            >
              <Ellipsis size={13} strokeWidth={1.5} />
            </PopoverTrigger>

            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={6}
              data-merak-code-more-popover="true"
              {...stylex.props(styles.popoverReset)}
            >
              <div {...stylex.props(styles.moreCard)}>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    void handleCopy();
                  }}
                  {...stylex.props(styles.menuRow)}
                >
                  <span {...stylex.props(styles.menuRowLeft)}>
                    <span {...stylex.props(styles.menuIcon)}>
                      <Copy size={14} />
                    </span>
                    <span {...stylex.props(styles.menuLabel)}>Copy code</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWrapped((prev) => !prev);
                    setMoreOpen(false);
                  }}
                  {...stylex.props(styles.menuRow)}
                >
                  <span {...stylex.props(styles.menuRowLeft)}>
                    <span {...stylex.props(styles.menuIcon)}>
                      <CornerDownLeft size={14} />
                    </span>
                    <span {...stylex.props(styles.menuLabel)}>Wrap code</span>
                  </span>
                  {wrapped ? (
                    <span {...stylex.props(styles.menuCheck)}>
                      <Check size={13} />
                    </span>
                  ) : null}
                </button>

                <div {...stylex.props(styles.menuDivider)} />

                <button
                  type="button"
                  onClick={handleDuplicate}
                  {...stylex.props(styles.menuRow)}
                >
                  <span {...stylex.props(styles.menuRowLeft)}>
                    <span {...stylex.props(styles.menuIcon)}>
                      <CopyPlus size={14} />
                    </span>
                    <span {...stylex.props(styles.menuLabel)}>Duplicate</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  {...stylex.props(styles.menuRow, styles.menuRowDanger)}
                >
                  <span {...stylex.props(styles.menuRowLeft)}>
                    <span {...stylex.props(styles.menuIcon, styles.menuDangerIcon)}>
                      <Trash2 size={14} />
                    </span>
                    <span {...stylex.props(styles.menuLabel)}>Delete</span>
                  </span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <pre className="merak-code-pre">
        <code ref={setCodeRef} className="merak-code-content" />
      </pre>
    </div>
  );
}

const createMerakReactCodeBlockSpec = createReactBlockSpec(
  baseCodeBlockSpec.config,
  {
    meta: {
      ...baseCodeBlockSpec.implementation.meta,
      highlight: (block) => normalizeCodeLanguage(block.props.language),
    },
    parse: baseCodeBlockSpec.implementation.parse,
    parseContent: baseCodeBlockSpec.implementation.parseContent,
    render: MerakCodeBlockView,
  },
  baseCodeBlockSpec.extensions,
);

export function createMerakCodeBlockSpec() {
  const spec = createMerakReactCodeBlockSpec();
  // Preserve BlockNote's native <pre><code class="language-..."> output so Markdown serialization and copy HTML match exactly.
  spec.implementation.toExternalHTML = baseCodeBlockSpec.implementation.toExternalHTML;
  return spec;
}
