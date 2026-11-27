import { html } from "@codemirror/lang-html";
import type { AssetEditorProps } from "@merak/shared";
import {
  Badge,
  Button,
  EmptyState,
  Inline,
  Resizable,
  ResizableHandle,
  ResizablePanel,
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@merak/ui";
import { colors, font, radius, shadow, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { basicSetup, EditorView } from "codemirror";
import {
  Blocks,
  Code2,
  Columns2,
  Eye,
  Monitor,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Tablet,
  Terminal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./editors.css";
import {
  type ArtifactConsoleEntry,
  HTML_ARTIFACT_SANDBOX,
  injectUiSdkIntoHtml,
  parseArtifactBridgeMessage,
} from "./htmlHelpers.js";
import { isSaveShortcut, useGlobalSaveShortcut } from "./shared.js";

type PaneMode = "split" | "preview" | "code";
type ViewportPreset = "desktop" | "tablet" | "mobile";

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: "420px",
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.md,
    backgroundColor: colors.bgSubtle,
    borderBottom: `1px solid ${colors.border}`,
  },
  titleText: {
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
    maxWidth: "220px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  workspace: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  resizable: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    width: "100%",
    height: "100%",
  },
  codePanel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minWidth: 0,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  paneHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: space.xs,
    paddingInline: space.md,
    fontSize: font.sizeXs,
    fontWeight: 600,
    color: colors.textMuted,
    backgroundColor: colors.bgSubtle,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  cmHost: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  previewPanel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minWidth: 0,
    backgroundColor: colors.bgSubtle,
    overflow: "hidden",
  },
  previewCanvas: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "stretch",
    padding: space.md,
    overflow: "auto",
  },
  previewCanvasFull: {
    padding: 0,
  },
  viewportFrame: {
    height: "100%",
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.sm,
    overflow: "hidden",
    transition: "width 160ms ease",
  },
  viewportDesktop: {
    width: "100%",
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
  },
  viewportTablet: {
    width: "768px",
    maxWidth: "100%",
  },
  viewportMobile: {
    width: "390px",
    maxWidth: "100%",
  },
  iframe: {
    display: "block",
    width: "100%",
    height: "100%",
    border: "none",
    backgroundColor: colors.bg,
  },
  handle: {
    width: "6px",
    backgroundColor: colors.borderSubtle,
    cursor: "col-resize",
    flexShrink: 0,
  },
  consoleBar: {
    display: "flex",
    flexDirection: "column",
    height: "180px",
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.bgElevated,
  },
  consoleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: space.xs,
    paddingInline: space.md,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgSubtle,
    fontSize: font.sizeXs,
    fontWeight: 600,
    color: colors.textMuted,
  },
  consoleList: {
    flex: 1,
    overflowY: "auto",
    padding: space.sm,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    fontFamily: font.mono,
    fontSize: font.sizeXs,
  },
  consoleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: space.sm,
    paddingBlock: space.xxs,
    paddingInline: space.xs,
    borderRadius: radius.sm,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  consoleTimestamp: {
    color: colors.textSubtle,
    flexShrink: 0,
  },
  consoleMessage: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: colors.text,
    flex: 1,
  },
  iconLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
  },
});

const VIEWPORT_STYLE_MAP: Record<ViewportPreset, stylex.StyleXStyles> = {
  desktop: styles.viewportDesktop,
  tablet: styles.viewportTablet,
  mobile: styles.viewportMobile,
};

function createCodeMirrorTheme(theme: "light" | "dark") {
  const isDark = theme === "dark";
  return [
    EditorView.darkTheme.of(isDark),
    EditorView.theme(
      {
        "&": {
          height: "100%",
          backgroundColor: isDark ? "#111215" : "#ffffff",
          color: isDark ? "#eceef2" : "#18181b",
        },
        ".cm-gutters": {
          backgroundColor: isDark ? "#18191d" : "#f7f7f5",
          color: isDark ? "#6e7380" : "#8c8c94",
          borderRight: `1px solid ${isDark ? "#2c2e36" : "#e4e4e0"}`,
        },
        ".cm-activeLine": {
          backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.04)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.06)",
        },
        "&.cm-focused": {
          outline: "none",
        },
      },
      { dark: isDark },
    ),
  ];
}

export function HtmlArtifactEditor({
  node,
  readOnly = false,
  theme,
  onChange,
  onSave,
}: AssetEditorProps) {
  const [code, setCode] = useState<string>(node.content);
  const [paneMode, setPaneMode] = useState<PaneMode>(readOnly ? "preview" : "split");
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ArtifactConsoleEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const cmContainerRef = useRef<HTMLDivElement | null>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const codeRef = useRef(code);
  codeRef.current = code;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const lastNodeIdRef = useRef(node.id);

  // Re-sync local code and CodeMirror document when switching to a different node.
  useEffect(() => {
    if (lastNodeIdRef.current !== node.id) {
      lastNodeIdRef.current = node.id;
      setCode(node.content);
      setConsoleEntries([]);
      setReloadNonce((n) => n + 1);
      const view = cmViewRef.current;
      if (view && view.state.doc.toString() !== node.content) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: node.content },
        });
      }
    }
  }, [node.id, node.content]);

  const handleSave = useCallback(async () => {
    if (!onSaveRef.current || readOnly) return;
    setSaving(true);
    try {
      await onSaveRef.current(codeRef.current);
    } finally {
      setSaving(false);
    }
  }, [readOnly]);

  useGlobalSaveShortcut(Boolean(onSave) && !readOnly, handleSave);

  // Mount CodeMirror 6 when the code pane is visible.
  const showCodePane = paneMode === "split" || paneMode === "code";
  const showPreviewPane = paneMode === "split" || paneMode === "preview";

  useEffect(() => {
    if (!showCodePane) {
      cmViewRef.current?.destroy();
      cmViewRef.current = null;
      return;
    }

    const host = cmContainerRef.current;
    if (!host) return;

    const view = new EditorView({
      doc: codeRef.current,
      extensions: [
        basicSetup,
        html(),
        EditorView.editable.of(!readOnly),
        ...createCodeMirrorTheme(theme),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = update.state.doc.toString();
          codeRef.current = next;
          setCode(next);
          onChangeRef.current(next);
        }),
        EditorView.domEventHandlers({
          keydown: (event) => {
            if (isSaveShortcut(event) && onSaveRef.current && !readOnly) {
              event.preventDefault();
              void handleSave();
              return true;
            }
            return false;
          },
        }),
      ],
      parent: host,
    });

    cmViewRef.current = view;
    return () => {
      view.destroy();
      cmViewRef.current = null;
    };
  }, [showCodePane, theme, readOnly, node.id, handleSave]);

  const postThemeToIframe = useCallback((targetTheme: "light" | "dark") => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "merak:theme", theme: targetTheme },
        "*",
      );
    } catch {
      // Ignore detached iframe postMessage failures.
    }
  }, []);

  // Forward theme updates whenever parent theme changes.
  useEffect(() => {
    postThemeToIframe(theme);
  }, [theme, postThemeToIframe]);

  // Listen to sandboxed iframe bridge events (`merak:ready`, `merak:console`).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;

      const parsed = parseArtifactBridgeMessage(event.data);
      if (!parsed) return;

      if (parsed.type === "merak:ready") {
        postThemeToIframe(themeRef.current);
        return;
      }

      if (parsed.type === "merak:console") {
        const entry: ArtifactConsoleEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          level: parsed.level,
          message: parsed.message,
          timestamp: new Date().toLocaleTimeString(),
        };
        setConsoleEntries((prev) => [...prev.slice(-199), entry]);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [postThemeToIframe]);

  const srcDoc = useMemo(() => injectUiSdkIntoHtml(code), [code]);

  const errorCount = useMemo(
    () => consoleEntries.filter((entry) => entry.level === "error").length,
    [consoleEntries],
  );

  const renderCodePane = () => (
    <div {...stylex.props(styles.codePanel)}>
      <div {...stylex.props(styles.paneHeader)}>
        <span {...stylex.props(styles.iconLabel)}>
          <Code2 size={13} />
          HTML Source
        </span>
        <span>{code.split("\n").length} lines</span>
      </div>
      <div ref={cmContainerRef} className="merak-cm-host" {...stylex.props(styles.cmHost)} />
    </div>
  );

  const renderPreviewPane = () => (
    <div {...stylex.props(styles.previewPanel)}>
      <div {...stylex.props(styles.paneHeader)}>
        <span {...stylex.props(styles.iconLabel)}>
          <Eye size={13} />
          Sandboxed Preview
        </span>
        <Badge tone="neutral">
          <ShieldCheck size={12} />
          sandbox=&quot;{HTML_ARTIFACT_SANDBOX}&quot;
        </Badge>
      </div>
      <div
        {...stylex.props(
          styles.previewCanvas,
          viewport === "desktop" && styles.previewCanvasFull,
        )}
      >
        <div {...stylex.props(styles.viewportFrame, VIEWPORT_STYLE_MAP[viewport])}>
          <iframe
            key={`${node.id}-${reloadNonce}`}
            ref={iframeRef}
            title={`Preview: ${node.title}`}
            sandbox={HTML_ARTIFACT_SANDBOX}
            srcDoc={srcDoc}
            onLoad={() => postThemeToIframe(themeRef.current)}
            {...stylex.props(styles.iframe)}
          />
        </div>
      </div>
    </div>
  );

  return (
    <section
      aria-label={`HTML Artifact Editor: ${node.title}`}
      {...stylex.props(styles.root)}
    >
      <Toolbar aria-label="HTML Artifact toolbar" {...stylex.props(styles.toolbar)}>
        <Inline gap="sm">
          <Blocks size={16} />
          <span {...stylex.props(styles.titleText)}>{node.title}</span>
          <Badge tone="accent">HTML</Badge>
          {readOnly ? <Badge tone="neutral">Read-only</Badge> : null}
        </Inline>

        <ToolbarGroup>
          <SegmentedControl
            aria-label="Editor layout"
            value={paneMode}
            onValueChange={(next) => {
              if (next) setPaneMode(next as PaneMode);
            }}
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="split">
              <span {...stylex.props(styles.iconLabel)}>
                <Columns2 size={13} />
                Split
              </span>
            </SegmentedControlItem>
            <SegmentedControlItem value="preview">
              <span {...stylex.props(styles.iconLabel)}>
                <Eye size={13} />
                Preview
              </span>
            </SegmentedControlItem>
            <SegmentedControlItem value="code">
              <span {...stylex.props(styles.iconLabel)}>
                <Code2 size={13} />
                Code
              </span>
            </SegmentedControlItem>
          </SegmentedControl>

          <ToolbarSeparator />

          <SegmentedControl
            aria-label="Preview viewport"
            value={viewport}
            onValueChange={(next) => {
              if (next) setViewport(next as ViewportPreset);
            }}
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="desktop">
              <span {...stylex.props(styles.iconLabel)}>
                <Monitor size={13} />
                Desktop
              </span>
            </SegmentedControlItem>
            <SegmentedControlItem value="tablet">
              <span {...stylex.props(styles.iconLabel)}>
                <Tablet size={13} />
                768px
              </span>
            </SegmentedControlItem>
            <SegmentedControlItem value="mobile">
              <span {...stylex.props(styles.iconLabel)}>
                <Smartphone size={13} />
                390px
              </span>
            </SegmentedControlItem>
          </SegmentedControl>
        </ToolbarGroup>

        <Inline gap="xs">
          <Button
            onClick={() => setReloadNonce((prev) => prev + 1)}
            aria-label="Reload preview"
          >
            <RefreshCw size={14} />
            Reload
          </Button>
          <Button
            onClick={() => setConsoleOpen((prev) => !prev)}
            aria-pressed={consoleOpen}
            aria-label="Toggle artifact console"
          >
            <Terminal size={14} />
            Console
            {consoleEntries.length > 0 ? (
              <Badge tone={errorCount > 0 ? "danger" : "neutral"}>
                {consoleEntries.length}
              </Badge>
            ) : null}
          </Button>
          {onSave && !readOnly ? (
            <Button disabled={saving} onClick={handleSave}>
              <Save size={14} />
              {saving ? "Saving..." : "Save"}
            </Button>
          ) : null}
        </Inline>
      </Toolbar>

      <div {...stylex.props(styles.workspace)}>
        {paneMode === "split" ? (
          <Resizable
            orientation="horizontal"
            defaultLayout={[45, 55]}
            {...stylex.props(styles.resizable)}
          >
            <ResizablePanel id="html-code-pane" defaultSize={45} minSize={20}>
              {renderCodePane()}
            </ResizablePanel>
            <ResizableHandle aria-label="Resize code and preview panels" {...stylex.props(styles.handle)} />
            <ResizablePanel id="html-preview-pane" defaultSize={55} minSize={25}>
              {renderPreviewPane()}
            </ResizablePanel>
          </Resizable>
        ) : showCodePane ? (
          renderCodePane()
        ) : showPreviewPane ? (
          renderPreviewPane()
        ) : null}

        {consoleOpen ? (
          <div role="region" aria-label="Artifact Console" {...stylex.props(styles.consoleBar)}>
            <div {...stylex.props(styles.consoleHeader)}>
              <Inline gap="xs">
                <Terminal size={13} />
                <span>Console Output</span>
                {errorCount > 0 ? (
                  <Badge tone="danger">{errorCount} errors</Badge>
                ) : null}
              </Inline>
              <Button
                onClick={() => setConsoleEntries([])}
                disabled={consoleEntries.length === 0}
              >
                <Trash2 size={13} />
                Clear
              </Button>
            </div>
            <div {...stylex.props(styles.consoleList)}>
              {consoleEntries.length === 0 ? (
                <EmptyState
                  title="No console messages"
                  description="Runtime warnings, errors, and console events from the sandboxed artifact will appear here."
                />
              ) : (
                consoleEntries.map((entry) => (
                  <div key={entry.id} {...stylex.props(styles.consoleRow)}>
                    <Badge
                      tone={
                        entry.level === "error"
                          ? "danger"
                          : entry.level === "warn"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {entry.level}
                    </Badge>
                    <span {...stylex.props(styles.consoleTimestamp)}>{entry.timestamp}</span>
                    <pre {...stylex.props(styles.consoleMessage)}>{entry.message}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
