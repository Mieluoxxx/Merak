import {
  createReactBlockSpec,
  createReactInlineContentSpec,
  type ReactCustomBlockRenderProps,
  type ReactCustomInlineContentRenderProps,
} from "@blocknote/react";
import { Popover, PopoverContent, PopoverTrigger } from "@merak/ui";
import * as stylex from "@stylexjs/stylex";
import "katex/dist/katex.min.css";
import { CornerDownLeft, Radical } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  renderKatexHtml,
  tokenizeLatexForHighlight,
} from "./mathHelpers.js";

const pendingBlockEquationAutoOpen = new Set<string>();
let pendingInlineEquationAutoOpen = false;

export function markBlockEquationAutoOpen(blockId: string): void {
  if (blockId) {
    pendingBlockEquationAutoOpen.add(blockId);
  }
}

export function markNextInlineEquationAutoOpen(): void {
  pendingInlineEquationAutoOpen = true;
}

function consumeBlockEquationAutoOpen(blockId: string): boolean {
  if (!pendingBlockEquationAutoOpen.has(blockId)) return false;
  pendingBlockEquationAutoOpen.delete(blockId);
  return true;
}

function consumeNextInlineEquationAutoOpen(): boolean {
  if (!pendingInlineEquationAutoOpen) return false;
  pendingInlineEquationAutoOpen = false;
  return true;
}

const BLOCK_PLACEHOLDER = [
  "|x| = \\begin{cases}",
  "  x, &\\quad x \\geq 0 \\\\",
  " -x, &\\quad x < 0",
  "\\end{cases}",
].join("\n");

const INLINE_PLACEHOLDER = "E = mc^2";

const styles = stylex.create({
  popoverReset: {
    gap: 0,
    rowGap: 0,
    width: "auto",
    maxWidth: "none",
    overflow: "visible",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    boxShadow: "none",
  },
});

function TexSymbolIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 18"
      width="22"
      height="17"
      className="merak-eq-tex-icon"
    >
      <text
        x="0"
        y="12.5"
        fontSize="11.5"
        fontFamily="KaTeX_Main, Georgia, Times New Roman, serif"
        fontWeight="600"
        fill="currentColor"
      >
        T
      </text>
      <text
        x="6.5"
        y="15"
        fontSize="10.5"
        fontFamily="KaTeX_Main, Georgia, Times New Roman, serif"
        fontWeight="600"
        fill="currentColor"
      >
        E
      </text>
      <text
        x="12.5"
        y="12.5"
        fontSize="11.5"
        fontFamily="KaTeX_Main, Georgia, Times New Roman, serif"
        fontWeight="600"
        fill="currentColor"
      >
        X
      </text>
    </svg>
  );
}

interface EquationEditorPopoverProps {
  mode: "block" | "inline";
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  error: string | null;
  onCommit: () => void;
  onCancel: () => void;
  trigger: ReactNode;
}

function EquationEditorPopover({
  mode,
  open,
  onOpenChange,
  draft,
  onDraftChange,
  error,
  onCommit,
  onCancel,
  trigger,
}: EquationEditorPopoverProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLPreElement>(null);

  const tokens = useMemo(() => tokenizeLatexForHighlight(draft), [draft]);

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight =
      typeof window !== "undefined"
        ? Math.round(window.innerHeight * (mode === "block" ? 0.5 : 0.3))
        : 320;
    const minHeight = mode === "block" ? 60 : 25;
    const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${nextHeight}px`;
    if (mirrorRef.current) {
      mirrorRef.current.style.height = `${nextHeight}px`;
    }
  }, [mode]);

  useLayoutEffect(() => {
    if (!open) return;
    syncTextareaHeight();
  }, [draft, open, syncTextareaHeight]);

  useEffect(() => {
    if (!open) return;
    const timer = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      syncTextareaHeight();
    });
    return () => cancelAnimationFrame(timer);
  }, [open, syncTextareaHeight]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!error) {
        onCommit();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (!error) {
      onCommit();
    } else {
      onCancel();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {trigger}
      <PopoverContent
        side="bottom"
        align={mode === "block" ? "start" : "center"}
        sideOffset={6}
        initialFocus={() => textareaRef.current}
        data-merak-equation-popover="true"
        {...stylex.props(styles.popoverReset)}
      >
        <div
          className="merak-eq-popover"
          data-mode={mode}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="merak-eq-popover-row">
            <div className="merak-eq-input-stack">
              <pre ref={mirrorRef} aria-hidden="true" className="merak-eq-highlight-mirror">
                {tokens.map((tok, index) => {
                  if (tok.kind === "command") {
                    return (
                      <span key={index} className="merak-eq-latex-cmd">
                        {tok.text}
                      </span>
                    );
                  }
                  if (tok.kind === "brace") {
                    return (
                      <span key={index} className="merak-eq-latex-brace">
                        {tok.text}
                      </span>
                    );
                  }
                  return <span key={index}>{tok.text}</span>;
                })}
                {draft.endsWith("\n") || draft.length === 0 ? " " : ""}
              </pre>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={() => {
                  if (textareaRef.current && mirrorRef.current) {
                    mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
                  }
                }}
                rows={mode === "block" ? 3 : 1}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder={mode === "block" ? BLOCK_PLACEHOLDER : INLINE_PLACEHOLDER}
                aria-label="Equation (LaTeX)"
                className="merak-eq-textarea"
                data-mode={mode}
              />
            </div>

            <button
              type="button"
              disabled={Boolean(error)}
              onClick={onCommit}
              className="merak-eq-done-btn"
              data-merak-eq-done="true"
            >
              <span>Done</span>
              <CornerDownLeft size={12} strokeWidth={2} />
            </button>
          </div>

          {error ? (
            <div className="merak-eq-error-bar" role="status">
              Invalid equation: {error}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InvalidEquationPill() {
  return (
    <span className="merak-eq-invalid-pill">
      <Radical size={13} strokeWidth={2} />
      <span>Invalid equation</span>
    </span>
  );
}

const blockEquationConfig = {
  type: "merakBlockEquation" as const,
  propSchema: {
    latex: { default: "" },
  },
  content: "none" as const,
};

function MerakBlockEquationView({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof blockEquationConfig>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(block.props.latex);
  const initialValueRef = useRef(block.props.latex);

  useEffect(() => {
    if (!open) {
      setDraft(block.props.latex);
    }
  }, [block.props.latex, open]);

  useEffect(() => {
    if (editor.isEditable && consumeBlockEquationAutoOpen(block.id)) {
      initialValueRef.current = block.props.latex;
      setDraft(block.props.latex);
      setOpen(true);
    }
  }, [block.id, block.props.latex, editor.isEditable]);

  const activeLatex = open ? draft : block.props.latex;
  const trimmedLatex = activeLatex.trim();
  const renderResult = useMemo(
    () => renderKatexHtml(activeLatex, true),
    [activeLatex],
  );
  const errorMessage = renderResult.ok ? null : renderResult.error;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!editor.isEditable) return;
      if (nextOpen) {
        initialValueRef.current = block.props.latex;
        setDraft(block.props.latex);
        setOpen(true);
      } else {
        setOpen(false);
      }
    },
    [block.props.latex, editor.isEditable],
  );

  const handleCommit = useCallback(() => {
    const nextLatex = draft.trim();
    const check = renderKatexHtml(nextLatex, true);
    if (!check.ok) return;
    if (nextLatex !== block.props.latex) {
      editor.updateBlock(block.id, {
        props: { latex: nextLatex },
      });
    }
    setOpen(false);
    queueMicrotask(() => {
      editor.focus();
    });
  }, [block.id, block.props.latex, draft, editor]);

  const handleCancel = useCallback(() => {
    setDraft(initialValueRef.current);
    setOpen(false);
    queueMicrotask(() => {
      editor.focus();
    });
  }, [editor]);

  const surface = (
    <div
      className="merak-block-equation"
      data-empty={trimmedLatex.length === 0 ? "true" : "false"}
      data-editing={open ? "true" : "false"}
      data-invalid={!renderResult.ok ? "true" : "false"}
      data-merak-block-equation={block.props.latex}
      contentEditable={false}
    >
      {trimmedLatex.length === 0 ? (
        <div className="merak-block-equation-empty">
          <TexSymbolIcon />
          <span>Add a TeX equation</span>
        </div>
      ) : renderResult.ok ? (
        <div
          className="merak-block-equation-katex"
          dangerouslySetInnerHTML={{ __html: renderResult.html }}
        />
      ) : (
        <div className="merak-block-equation-invalid">
          <InvalidEquationPill />
        </div>
      )}
    </div>
  );

  if (!editor.isEditable) {
    return surface;
  }

  return (
    <EquationEditorPopover
      mode="block"
      open={open}
      onOpenChange={handleOpenChange}
      draft={draft}
      onDraftChange={setDraft}
      error={errorMessage}
      onCommit={handleCommit}
      onCancel={handleCancel}
      trigger={
        <PopoverTrigger
          render={
            <div
              role="button"
              tabIndex={0}
              aria-label="Edit block equation"
              className="merak-block-equation-trigger"
              onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          }
        >
          {surface}
        </PopoverTrigger>
      }
    />
  );
}

function MerakBlockEquationExternalHTML({
  block,
}: ReactCustomBlockRenderProps<typeof blockEquationConfig>) {
  const latex = block.props.latex.trim();
  const renderResult = renderKatexHtml(latex, true);
  return (
    <div data-merak-block-equation={latex}>
      {renderResult.ok && renderResult.html ? (
        <span dangerouslySetInnerHTML={{ __html: renderResult.html }} />
      ) : (
        <span>{latex ? `$$\n${latex}\n$$` : ""}</span>
      )}
    </div>
  );
}

const createMerakReactBlockEquationSpec = createReactBlockSpec(blockEquationConfig, {
  parse: (element) => {
    const attr = element.getAttribute("data-merak-block-equation");
    if (attr !== null) {
      return { latex: attr };
    }
    return undefined;
  },
  render: MerakBlockEquationView,
  toExternalHTML: MerakBlockEquationExternalHTML,
});

export function createMerakBlockEquationSpec() {
  return createMerakReactBlockEquationSpec();
}

const inlineEquationConfig = {
  type: "merakEquation" as const,
  propSchema: {
    latex: { default: "" },
  },
  content: "none" as const,
};

function MerakInlineEquationView({
  inlineContent,
  updateInlineContent,
  editor,
}: ReactCustomInlineContentRenderProps<typeof inlineEquationConfig, any>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(inlineContent.props.latex);
  const initialValueRef = useRef(inlineContent.props.latex);

  useEffect(() => {
    if (!open) {
      setDraft(inlineContent.props.latex);
    }
  }, [inlineContent.props.latex, open]);

  useEffect(() => {
    if (editor.isEditable && consumeNextInlineEquationAutoOpen()) {
      initialValueRef.current = inlineContent.props.latex;
      setDraft(inlineContent.props.latex);
      setOpen(true);
    }
  }, [editor.isEditable, inlineContent.props.latex]);

  const activeLatex = open ? draft : inlineContent.props.latex;
  const trimmedLatex = activeLatex.trim();
  const renderResult = useMemo(
    () => renderKatexHtml(activeLatex, false),
    [activeLatex],
  );
  const errorMessage = renderResult.ok ? null : renderResult.error;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!editor.isEditable) return;
      if (nextOpen) {
        initialValueRef.current = inlineContent.props.latex;
        setDraft(inlineContent.props.latex);
        setOpen(true);
      } else {
        setOpen(false);
      }
    },
    [editor.isEditable, inlineContent.props.latex],
  );

  const handleCommit = useCallback(() => {
    const nextLatex = draft.trim();
    const check = renderKatexHtml(nextLatex, false);
    if (!check.ok) return;
    if (nextLatex !== inlineContent.props.latex) {
      updateInlineContent({
        type: "merakEquation",
        props: { latex: nextLatex },
      });
    }
    setOpen(false);
    queueMicrotask(() => {
      editor.focus();
    });
  }, [draft, editor, inlineContent.props.latex, updateInlineContent]);

  const handleCancel = useCallback(() => {
    setDraft(initialValueRef.current);
    setOpen(false);
    queueMicrotask(() => {
      editor.focus();
    });
  }, [editor]);

  const body =
    trimmedLatex.length === 0 ? (
      <span className="merak-inline-equation-empty">New equation</span>
    ) : renderResult.ok ? (
      <span
        className="merak-inline-equation-katex"
        dangerouslySetInnerHTML={{ __html: renderResult.html }}
      />
    ) : (
      <InvalidEquationPill />
    );

  if (!editor.isEditable) {
    return (
      <span
        className="merak-inline-equation"
        data-merak-inline-equation={inlineContent.props.latex}
        contentEditable={false}
      >
        {body}
      </span>
    );
  }

  return (
    <EquationEditorPopover
      mode="inline"
      open={open}
      onOpenChange={handleOpenChange}
      draft={draft}
      onDraftChange={setDraft}
      error={errorMessage}
      onCommit={handleCommit}
      onCancel={handleCancel}
      trigger={
        <PopoverTrigger
          render={
            <span
              role="button"
              tabIndex={0}
              aria-label="Edit inline equation"
              className="merak-inline-equation"
              data-editing={open ? "true" : "false"}
              data-invalid={!renderResult.ok ? "true" : "false"}
              data-merak-inline-equation={inlineContent.props.latex}
              contentEditable={false}
              onMouseDown={(event: ReactMouseEvent<HTMLSpanElement>) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          }
        >
          {body}
        </PopoverTrigger>
      }
    />
  );
}

function MerakInlineEquationExternalHTML({
  inlineContent,
}: ReactCustomInlineContentRenderProps<typeof inlineEquationConfig, any>) {
  const latex = inlineContent.props.latex.trim();
  const renderResult = renderKatexHtml(latex, false);
  return (
    <span data-merak-inline-equation={latex}>
      {renderResult.ok && renderResult.html ? (
        <span dangerouslySetInnerHTML={{ __html: renderResult.html }} />
      ) : (
        <span>{latex ? `$${latex}$` : ""}</span>
      )}
    </span>
  );
}

export function createMerakInlineEquationSpec() {
  return createReactInlineContentSpec(inlineEquationConfig, {
    parse: (element) => {
      const attr = element.getAttribute("data-merak-inline-equation");
      if (attr !== null) {
        return { latex: attr };
      }
      return undefined;
    },
    render: MerakInlineEquationView,
    toExternalHTML: MerakInlineEquationExternalHTML,
  });
}
