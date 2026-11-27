# Merak Wave 1 Parallel Worker Guide

Wave 0 has locked `pnpm-lock.yaml`, frozen all shared contracts in `packages/shared`, built the project-wide Agent UI SDK in `packages/ui` (`@merak/ui`), created the SQLite + FTS5 schema in `apps/server`, and verified the UI SDK + StyleX + Vite shell in `apps/web`.

## Global Rules for All Wave 1 Workers

1. **Do NOT edit** `pnpm-lock.yaml`, root `package.json`, `pnpm-workspace.yaml`, `packages/shared`, or `packages/ui` unless explicitly coordinated (contracts & UI SDK are frozen).
2. **Use `@merak/ui` as the single UI SDK across the entire project**:
   - Powered by **Vercel Labs UI SDK** (`@ui-sdk/core`, `@ui-sdk/react`, `@ui-sdk/web` `0.1.0-beta.17`) + `@ui-sdk/core/web.css` + **StyleX** (`@stylexjs/stylex`).
   - Do **NOT** install or import `@base-ui/react`, Tailwind, Mantine, or hand-rolled accessible primitives.
   - Coding agents working on frontend tasks may optionally equip the upstream skill: `npx skills add vercel-labs/ui --skill ui-sdk`.
3. **Verified package import paths** (checked against installed versions):
   - UI SDK primitives & composites: `import { Button, Input, Textarea, Field, Tabs, TabsList, TabsTab, TabsPanel, Tree, TreeItem, TreeItemLabel, TreeItemIndicator, TreeGroup, Menu, MenuTrigger, MenuContent, MenuItem, Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose, Popover, Tooltip, Command, CommandInput, CommandList, CommandItem, CommandEmpty, Resizable, ResizablePanel, ResizableHandle, Waterfall, FileInput, ToastRegion, toast, createAgent, registerTools, ThemeScope, Stack, Inline, Card, Badge, EmptyState } from "@merak/ui"`
   - UI SDK default CSS: `import "@merak/ui/web.css"` (already loaded in `apps/web/src/main.tsx`)
   - StyleX design tokens: `import { colors, space, radius, font, shadow, zIndex, lightTheme, darkTheme } from "@merak/ui/tokens.stylex"`
   - StyleX Vite plugin: `import stylex from "@stylexjs/unplugin/vite"` (`@stylexjs/unplugin@0.19.2`, configured with `externalPackages: ["@merak/ui"]` and monorepo `unstable_moduleResolution`)
   - Artifact UI SDK assets (served by `apps/server`):
     - `/ui-sdk/web.css` (`@ui-sdk/core/web.css`)
     - `/ui-sdk/merak-ui.css` (Merak token variables + `.mk-*` helpers)
     - `/ui-sdk/merak-artifact.js` (sandboxed iframe theme & console bridge)
     - `/ui-sdk/manifest.json` (machine-readable `UI_SDK_MANIFEST`)
   - Better Auth server: `betterAuth` from `"better-auth"`, `drizzleAdapter` from `"better-auth/adapters/drizzle"`, `organization` from `"better-auth/plugins"` (`better-auth@1.7.28`)
   - Better Auth client: `createAuthClient` from `"better-auth/react"`, `organizationClient` from `"better-auth/client/plugins"`
   - MCP SDK Streamable HTTP (Web Standards for Hono): `McpServer` from `"@modelcontextprotocol/sdk/server/mcp.js"`, `WebStandardStreamableHTTPServerTransport` from `"@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"` (`@modelcontextprotocol/sdk@1.32.2`)
4. **3-Worker Alternative**: If running 3 parallel workers instead of 4, combine Worker #1 and Worker #2 into a single Backend + MCP worker (`apps/server` + `skills/merak`).

---

## Important `@ui-sdk/react` API Notes (Do Not Confuse with Radix/Base UI)

- Compound components use **flat named exports**, NOT `Tabs.Root` / `Dialog.Root`:
  - `Tabs` + `TabsList` + `TabsTab` + `TabsIndicator` + `TabsPanel`
  - `Dialog` + `DialogTrigger` + `DialogBackdrop` + `DialogContent` + `DialogTitle` + `DialogDescription` + `DialogClose`
  - `Menu` + `MenuTrigger` + `MenuContent` + `MenuItem` (`destructive?: boolean`, `onSelect`) + `MenuSeparator` + `MenuGroupLabel`
  - `Tree` + `TreeItem` + `TreeItemLabel` + `TreeItemIndicator` + `TreeGroup`
  - `Command` + `CommandInput` + `CommandList` + `CommandItem` + `CommandEmpty`
- Default styling comes from `@ui-sdk/core/web.css` via `data-slot` and state attributes (`data-variant="solid" | "destructive"`, `data-open`, `data-selected`, `data-disabled`). Layout and custom surfaces use `@stylexjs/stylex` + `@merak/ui/tokens.stylex`.

---

## Worker #1: Backend Core (Auth, Spaces, Nodes, Media, Search, WS)

- **Owned Paths** (exclusive):
  - `apps/server/src/auth/**`
  - `apps/server/src/services/**` (except `types.ts`, only extend `index.ts` factory)
  - `apps/server/src/media/**`
  - `apps/server/src/routes/**`
  - `apps/server/src/ws/**`
  - `apps/server/src/__tests__/**`
  - Wire routes + WS into `apps/server/src/app.ts` via a clean `mountCoreRoutes(app, services)` helper.
- **Deliverables**:
  1. Better Auth instance (`emailAndPassword` + `organization()` plugin) + auto-create Personal Organization & default `knowledge` space on user sign-up via Better Auth database hooks.
  2. Auth middleware resolving either Better Auth session cookie (`activeOrganizationId`) or `Authorization: Bearer mrk_...` via `McpTokenService.verifyRawToken`.
  3. Service implementations (`SpaceService`, `NodeService`, `MediaService`, `SearchService`, `McpTokenService`, `RealtimeBroadcaster`):
     - `NodeService`: tree retrieval, `expectedVersion` optimistic concurrency check (409 on mismatch), `patchDoc` exact-match replacement, LexoRank `moveNode` (preventing cycles when moving under descendants), soft delete & restore, FTS5 sync via `SearchService`, media ref sync via `MediaService.syncRefsForNode`.
     - `MediaService`: SHA-256 deduplication per org, disk storage in `env.MEDIA_DIR`, immutable HTTP cache headers (`Cache-Control: public, max-age=31536000, immutable`), orphan detection.
     - `SearchService`: SQLite FTS5 `nodes_fts` upsert/delete/query using `extractExcalidrawText` and `extractCanvasText`.
     - `RealtimeBroadcaster`: `@hono/node-ws` `/ws` channel subscriptions by `spaceId` with org membership check.
  4. Unit + integration tests (`vitest`) covering CRUD, optimistic locking, cycle detection, FTS5 search, media ref tracking & orphan cleanup, and team invitation permissions.

---

## Worker #2: Agent MCP Server & Merak Skills

- **Owned Paths** (exclusive):
  - `apps/server/src/mcp/**`
  - `skills/merak/**`
- **Deliverables**:
  1. `mountMcpRoutes(app, services)` exposing `app.all("/mcp", ...)` with `WebStandardStreamableHTTPServerTransport`:
     - Authenticate `Authorization: Bearer mrk_...` using `services.mcpTokens.verifyRawToken`.
     - Enforce token scopes (`spaceIds` allowlist + `"read"` vs `"write"` permission).
  2. Zod-validated MCP Tools consuming `AppServices`:
     - Read/Search: `list_spaces`, `get_tree`, `search_workspace`, `read_node`, `list_media`
     - Tree/Docs: `create_node`, `update_node`, `patch_doc`, `move_node`
     - Specialized Guardrails:
       - `upsert_excalidraw`: runs `normalizeExcalidrawDocument` before saving so LLM JSON never breaks Excalidraw.
       - `publish_html_artifact`: stores/updates `html` node and returns preview URL.
       - `upsert_canvas`: validates `jsonCanvasDocumentSchema` and referenced `nodeId`s before saving.
       - `upload_media`: accepts base64 payload or remote image data, deduplicates into Media Gallery, returns `/api/media/:id`.
     - UI Discovery Resource / Tool: expose `@merak/ui` `UI_SDK_MANIFEST` (`/ui-sdk/manifest.json`) so connected Agents know the exact `.mk-*` classes and `@ui-sdk` conventions for HTML Artifacts.
  3. `skills/merak/SKILL.md`: agent playbook covering Knowledge Base vs Project organization, child-node nesting, non-overlapping Excalidraw layout rules, self-contained HTML Artifacts linked to `/ui-sdk/web.css` + `/ui-sdk/merak-ui.css` + `/ui-sdk/merak-artifact.js`, and mandatory Media Gallery usage (never inline base64 images).
  4. MCP protocol tests (tool list, read/write scope enforcement, Excalidraw normalization, doc patching).

---

## Worker #3: Web Shell, Tree, Auth, Gallery, Search & Agent Bridge

- **Owned Paths** (exclusive):
  - `apps/web/src/layout/**`
  - `apps/web/src/features/**`
  - `apps/web/src/lib/ws.ts`
  - `apps/web/src/lib/auth-client.ts`
  - Wire routes + sidebar + `createAgent()` bridge in `apps/web/src/App.tsx` during Wave 2 integration (keep Worker #3 feature components modular).
- **Deliverables**:
  1. **No rebuilding UI primitives** — compose directly from `@merak/ui` + `@merak/ui/tokens.stylex`.
  2. Auth & Team Space flows (`auth-client.ts` with `organizationClient()`): Sign-in / Sign-up (`Field` + `Input`), team switcher (`Menu`), invite member modal (`Dialog`), MCP Token management UI (create with space/permission scope, copy once, revoke).
  3. Sidebar (`apps/web/src/layout/`): `Knowledge Base` + `Projects` sections, recursive Notion-style expandable node tree built with `@merak/ui` (`Tree`, `TreeItem`, `TreeItemLabel`, `TreeItemIndicator`, `TreeGroup`) + `@dnd-kit/core` & `@dnd-kit/sortable` drag-and-drop reparenting and LexoRank reordering, inline create child (`doc` / `excalidraw` / `html` / `canvas`).
  4. Media Gallery view (`apps/web/src/features/gallery/`): filter by space, drag-and-drop upload (`FileInput` / `FileInputDropzone`), reference count & backlinks list, orphan cleanup, copy URL.
  5. `Cmd+K` Command Palette (`apps/web/src/features/search/` using `Command`, `CommandInput`, `CommandList`, `CommandItem`, `CommandEmpty`) hitting `/api/search` + WebSocket live sync (`apps/web/src/lib/ws.ts`) invalidating TanStack Query caches on remote MCP/teammate edits with conflict banner if editing a stale node.
  6. Initialize `@merak/ui`'s `createAgent` / `registerTools` bridge so the workbench exposes structured `snapshot` / `query` / `act` agent primitives.

---

## Worker #4: Four Asset Editors

- **Owned Paths** (exclusive):
  - `apps/web/src/editors/**`
- **Deliverables** (every editor strictly implements `AssetEditorProps` from `@merak/shared` and uses `@merak/ui` + `@merak/ui/tokens.stylex` for toolbars/menus/panels):
  1. `MarkdownEditor.tsx` (BlockNote WYSIWYG):
     - Uses `@blocknote/core` + `@blocknote/react` + `@blocknote/ariakit` styled to match `@merak/ui/tokens.stylex` CSS variables.
     - Persists clean Markdown (`editor.blocksToMarkdownLossy` / `editor.tryParseMarkdownToBlocks`) — no proprietary JSON storage.
     - Custom `@merak/ui`-styled `/` slash menu items: `/subpage`, `/sub-excalidraw`, `/sub-html`, `/sub-canvas` (calls `onCreateChild` and inserts a clickable child card block), plus `/embed` (`::embed{node="<id>" height="460"}`) inline preview block using `resolveNode`.
     - Image paste/drop uploads via `onUploadMedia` and inserts `/api/media/<id>`.
  2. `ExcalidrawEditor.tsx`:
     - Wraps `@excalidraw/excalidraw` with `theme` sync, parses/serializes normalized JSON (`normalizeExcalidrawDocument`), intercepts pasted images to upload via `onUploadMedia`.
  3. `HtmlArtifactEditor.tsx`:
     - Split Preview / `CodeMirror 6` (`@codemirror/lang-html`) code pane built with `@merak/ui` `Resizable` / `ResizablePanel` / `ResizableHandle` + Desktop / Tablet / Mobile viewport switcher (`SegmentedControl`).
     - **Security boundary**: Preview `iframe` MUST use `sandbox="allow-scripts"` and **MUST NEVER** include `allow-same-origin`.
     - Automatically inject `<link rel="stylesheet" href="/ui-sdk/web.css">`, `<link rel="stylesheet" href="/ui-sdk/merak-ui.css">`, and `<script src="/ui-sdk/merak-artifact.js"></script>` into the rendered HTML `srcDoc` (if not already present).
     - Forward `theme` via `postMessage({ type: "merak:theme", theme })` on `merak:ready` and theme change (for Safari iframe `color-scheme` consistency) + capture `merak:console` messages in an expandable bottom console bar.
  4. `CanvasEditor.tsx`:
     - Wraps `@xyflow/react` reading/writing JSON Canvas 1.0 (`jsonCanvasDocumentSchema`).
     - Supports text notes, groups, edges, and embedded `file` cards (`nodeId` / `mediaId`) with **LOD activation** (lightweight preview card when idle/zoomed out; interactive/openable on focus or double-click).
