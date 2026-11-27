import { API_ROUTES } from "@merak/shared";
import {
  Badge,
  Button,
  Card,
  Inline,
  Stack,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  ThemeScope,
  type ThemeMode,
} from "@merak/ui";
import { colors, font, space } from "@merak/ui/tokens.stylex";
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
  brandTitle: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    fontSize: font.sizeLg,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  sectionLabel: {
    fontSize: font.sizeXs,
    fontWeight: 600,
    color: colors.textSubtle,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: space.xs,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    paddingBlock: space.xs,
    paddingInline: space.sm,
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
  tabsRoot: {
    display: "flex",
    flexDirection: "column",
    gap: space.md,
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
    lineHeight: 1.6,
  },
});

export function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>(API_ROUTES.health),
    retry: false,
  });

  return (
    <ThemeScope theme={themeMode}>
      <div {...stylex.props(styles.shell)}>
        {/* Worker #3 slot: replace sidebar with Knowledge Base + Project tree (@ui-sdk/react/tree + @dnd-kit) */}
        <aside {...stylex.props(styles.sidebar)}>
          <Inline justify="between">
            <div {...stylex.props(styles.brandTitle)}>
              <Sparkles size={18} />
              <span>Merak</span>
            </div>
            <Button
              onClick={() =>
                setThemeMode((prev) =>
                  prev === "system" ? "light" : prev === "light" ? "dark" : "system",
                )
              }
            >
              {themeMode}
            </Button>
          </Inline>

          <div>
            <div {...stylex.props(styles.sectionLabel)}>Knowledge Base</div>
            <Stack gap="xxs">
              <div {...stylex.props(styles.navItem)}>
                <FileText size={15} />
                <span>Architecture Notes</span>
              </div>
            </Stack>
          </div>

          <div>
            <div {...stylex.props(styles.sectionLabel)}>Projects</div>
            <Stack gap="xxs">
              <div {...stylex.props(styles.navItem)}>
                <FolderGit2 size={15} />
                <span>merak</span>
              </div>
              <div {...stylex.props(styles.navItem)}>
                <ImageIcon size={15} />
                <span>Media Gallery</span>
              </div>
            </Stack>
          </div>
        </aside>

        {/* Worker #3 + Worker #4 slot: workspace routes & 4 asset editors */}
        <main {...stylex.props(styles.main)}>
          <header {...stylex.props(styles.header)}>
            <div>
              <h1 {...stylex.props(styles.title)}>Merak Wave 0 Foundation</h1>
              <p {...stylex.props(styles.subtitle)}>
                Vercel Labs UI SDK (@ui-sdk/react + web.css) + StyleX + SQLite + Remote MCP ready for
                Wave 1 parallel workers.
              </p>
            </div>
            <Badge tone={health.isSuccess ? "accent" : "neutral"}>
              <Bot size={14} />
              {health.isSuccess
                ? `Server OK (${health.data.db})`
                : health.isLoading
                  ? "Checking server..."
                  : "Server offline (run dev:server)"}
            </Badge>
          </header>

          <Tabs defaultValue="doc" {...stylex.props(styles.tabsRoot)}>
            <TabsList>
              <TabsTab value="doc">
                <FileText size={14} />
                <span>WYSIWYG Markdown</span>
              </TabsTab>
              <TabsTab value="excalidraw">
                <PenTool size={14} />
                <span>Excalidraw</span>
              </TabsTab>
              <TabsTab value="html">
                <Blocks size={14} />
                <span>HTML Artifact</span>
              </TabsTab>
              <TabsTab value="canvas">
                <Network size={14} />
                <span>Infinite Canvas</span>
              </TabsTab>
            </TabsList>

            <TabsPanel value="doc">
              <Card>
                <h2 {...stylex.props(styles.panelTitle)}>BlockNote WYSIWYG Markdown Slot</h2>
                <p {...stylex.props(styles.panelHint)}>
                  Owned by Worker #4 in apps/web/src/editors/. Supports child pages and media gallery
                  uploads via AssetEditorProps, plus @merak/ui slash menus.
                </p>
              </Card>
            </TabsPanel>

            <TabsPanel value="excalidraw">
              <Card>
                <h2 {...stylex.props(styles.panelTitle)}>Excalidraw Whiteboard Slot</h2>
                <p {...stylex.props(styles.panelHint)}>
                  Owned by Worker #4. Normalized element schema shared with MCP agents.
                </p>
              </Card>
            </TabsPanel>

            <TabsPanel value="html">
              <Card>
                <h2 {...stylex.props(styles.panelTitle)}>Sandboxed HTML Artifact Slot</h2>
                <p {...stylex.props(styles.panelHint)}>
                  Owned by Worker #4. Strictly sandboxed iframe (allow-scripts only, no
                  allow-same-origin) wired to /ui-sdk/web.css, /ui-sdk/merak-ui.css, and
                  /ui-sdk/merak-artifact.js.
                </p>
              </Card>
            </TabsPanel>

            <TabsPanel value="canvas">
              <Card>
                <h2 {...stylex.props(styles.panelTitle)}>JSON Canvas 1.0 Infinite Canvas Slot</h2>
                <p {...stylex.props(styles.panelHint)}>
                  Owned by Worker #4. Powered by @xyflow/react with LOD card activation.
                </p>
              </Card>
            </TabsPanel>
          </Tabs>
        </main>
      </div>
    </ThemeScope>
  );
}
