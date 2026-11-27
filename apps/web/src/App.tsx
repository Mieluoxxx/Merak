import { Tabs } from "@base-ui/react/tabs";
import { API_ROUTES } from "@merak/shared";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import {
  Blocks,
  Bot,
  FileText,
  FolderGit2,
  Image as ImageIcon,
  Network,
  PenTool,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { apiFetch } from "./lib/api.js";
import { colors, darkTheme, font, lightTheme, radius, space } from "./styles/tokens.stylex.js";

interface HealthResponse {
  ok: boolean;
  db: string;
  timestamp: string;
}

const styles = stylex.create({
  shell: {
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    height: "100%",
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    padding: space.lg,
    backgroundColor: colors.bgSubtle,
    borderRight: `1px solid ${colors.border}`,
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  brandTitle: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    fontSize: font.sizeLg,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  themeButton: {
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgElevated,
    color: colors.textMuted,
    fontSize: font.sizeXs,
    cursor: "pointer",
  },
  sectionLabel: {
    fontSize: font.sizeXs,
    fontWeight: 600,
    color: colors.textSubtle,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: space.xs,
  },
  navGroup: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.sm,
    fontSize: font.sizeSm,
    color: colors.textMuted,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    padding: space.xxl,
    gap: space.xl,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    paddingBottom: space.lg,
  },
  title: {
    margin: 0,
    fontSize: font.sizeXl,
    fontWeight: 600,
  },
  subtitle: {
    margin: 0,
    marginTop: space.xs,
    fontSize: font.sizeSm,
    color: colors.textMuted,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.md,
    borderRadius: radius.full,
    fontSize: font.sizeXs,
    fontWeight: 500,
    backgroundColor: colors.accentSubtle,
    color: colors.accent,
  },
  tabsList: {
    display: "inline-flex",
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
    border: `1px solid ${colors.border}`,
    alignSelf: "flex-start",
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    paddingBlock: space.xs,
    paddingInline: space.md,
    borderRadius: radius.sm,
    border: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
      ":is([data-active])": colors.bgElevated,
    },
    color: {
      default: colors.textMuted,
      ":is([data-active])": colors.text,
    },
    fontSize: font.sizeSm,
    fontWeight: 500,
    cursor: "pointer",
  },
  panel: {
    padding: space.xl,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgElevated,
    fontSize: font.sizeMd,
    lineHeight: 1.6,
  },
  panelTitle: {
    margin: 0,
    marginBottom: space.sm,
    fontSize: font.sizeLg,
    fontWeight: 600,
  },
  panelHint: {
    margin: 0,
    color: colors.textMuted,
    fontSize: font.sizeSm,
  },
});

export function App() {
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("system");

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>(API_ROUTES.health),
    retry: false,
  });

  const themeClass =
    themeMode === "light" ? lightTheme : themeMode === "dark" ? darkTheme : undefined;

  return (
    <div {...stylex.props(themeClass, styles.shell)}>
      {/* Worker #3 slot: replace sidebar with Knowledge Base + Project tree & @dnd-kit */}
      <aside {...stylex.props(styles.sidebar)}>
        <div {...stylex.props(styles.brandRow)}>
          <div {...stylex.props(styles.brandTitle)}>
            <Sparkles size={18} />
            <span>Merak</span>
          </div>
          <button
            type="button"
            {...stylex.props(styles.themeButton)}
            onClick={() =>
              setThemeMode((prev) =>
                prev === "system" ? "light" : prev === "light" ? "dark" : "system",
              )
            }
          >
            {themeMode}
          </button>
        </div>

        <div>
          <div {...stylex.props(styles.sectionLabel)}>Knowledge Base</div>
          <div {...stylex.props(styles.navGroup)}>
            <div {...stylex.props(styles.navItem)}>
              <FileText size={15} />
              <span>Architecture Notes</span>
            </div>
          </div>
        </div>

        <div>
          <div {...stylex.props(styles.sectionLabel)}>Projects</div>
          <div {...stylex.props(styles.navGroup)}>
            <div {...stylex.props(styles.navItem)}>
              <FolderGit2 size={15} />
              <span>merak</span>
            </div>
            <div {...stylex.props(styles.navItem)}>
              <ImageIcon size={15} />
              <span>Media Gallery</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Worker #3 + Worker #4 slot: workspace routes & 4 asset editors */}
      <main {...stylex.props(styles.main)}>
        <header {...stylex.props(styles.header)}>
          <div>
            <h1 {...stylex.props(styles.title)}>Merak Wave 0 Foundation</h1>
            <p {...stylex.props(styles.subtitle)}>
              Base UI + StyleX + SQLite + Remote MCP ready for parallel Wave 1 workers.
            </p>
          </div>
          <span {...stylex.props(styles.badge)}>
            <Bot size={14} />
            {health.isSuccess
              ? `Server OK (${health.data.db})`
              : health.isLoading
                ? "Checking server..."
                : "Server offline (run dev:server)"}
          </span>
        </header>

        <Tabs.Root defaultValue="doc">
          <Tabs.List {...stylex.props(styles.tabsList)}>
            <Tabs.Tab value="doc" {...stylex.props(styles.tab)}>
              <FileText size={14} />
              <span>WYSIWYG Markdown</span>
            </Tabs.Tab>
            <Tabs.Tab value="excalidraw" {...stylex.props(styles.tab)}>
              <PenTool size={14} />
              <span>Excalidraw</span>
            </Tabs.Tab>
            <Tabs.Tab value="html" {...stylex.props(styles.tab)}>
              <Blocks size={14} />
              <span>HTML Artifact</span>
            </Tabs.Tab>
            <Tabs.Tab value="canvas" {...stylex.props(styles.tab)}>
              <Network size={14} />
              <span>Infinite Canvas</span>
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="doc" {...stylex.props(styles.panel)}>
            <h2 {...stylex.props(styles.panelTitle)}>BlockNote WYSIWYG Markdown Slot</h2>
            <p {...stylex.props(styles.panelHint)}>
              Owned by Worker #4 in apps/web/src/editors/. Supports child pages and media gallery
              uploads via AssetEditorProps.
            </p>
          </Tabs.Panel>

          <Tabs.Panel value="excalidraw" {...stylex.props(styles.panel)}>
            <h2 {...stylex.props(styles.panelTitle)}>Excalidraw Whiteboard Slot</h2>
            <p {...stylex.props(styles.panelHint)}>
              Owned by Worker #4. Normalized element schema shared with MCP agents.
            </p>
          </Tabs.Panel>

          <Tabs.Panel value="html" {...stylex.props(styles.panel)}>
            <h2 {...stylex.props(styles.panelTitle)}>Sandboxed HTML Artifact Slot</h2>
            <p {...stylex.props(styles.panelHint)}>
              Owned by Worker #4. Strictly sandboxed iframe (allow-scripts only, no
              allow-same-origin) + CodeMirror 6 split view.
            </p>
          </Tabs.Panel>

          <Tabs.Panel value="canvas" {...stylex.props(styles.panel)}>
            <h2 {...stylex.props(styles.panelTitle)}>JSON Canvas 1.0 Infinite Canvas Slot</h2>
            <p {...stylex.props(styles.panelHint)}>
              Owned by Worker #4. Powered by @xyflow/react with LOD card activation.
            </p>
          </Tabs.Panel>
        </Tabs.Root>
      </main>
    </div>
  );
}
