# Merak Wave 1 Parallel Worker Guide

Wave 0 has locked `pnpm-lock.yaml`, frozen all shared contracts in `packages/shared`, created the SQLite + FTS5 schema in `apps/server`, and verified the Base UI + StyleX + Vite shell in `apps/web`.

## Global Rules for All Wave 1 Workers

1. **Do NOT edit** `pnpm-lock.yaml`, root `package.json`, `pnpm-workspace.yaml`, or `packages/shared` unless explicitly coordinated (contracts are frozen).
2. **Import contracts from `@merak/shared`**:
   - Backend services implement interfaces in `apps/server/src/services/types.ts` (`AppServices`).
   - Frontend editors implement `AssetEditorProps` from `@merak/shared`.
3. **Verified package import paths** (checked against installed versions):
   - StyleX Vite plugin: `import stylex from "@stylexjs/unplugin/vite"` (`@stylexjs/unplugin@0.19.2`)
   - StyleX runtime: `import * as stylex from "@stylexjs/stylex"` (tokens live in `apps/web/src/styles/tokens.stylex.ts`)
   - Base UI subpaths: `import { Tabs } from "@base-ui/react/tabs"`, `@base-ui/react/dialog`, `@base-ui/react/menu`, `@base-ui/react/popover`, etc. (`@base-ui/react@1.9.0`)
   - Better Auth server: `betterAuth` from `"better-auth"`, `drizzleAdapter` from `"better-auth/adapters/drizzle"`, `organization` from `"better-auth/plugins"` (`better-auth@1.7.28`)
   - Better Auth client: `createAuthClient` from `"better-auth/react"`, `organizationClient` from `"better-auth/client/plugins"`
   - MCP SDK Streamable HTTP (Web Standards for Hono): `McpServer` from `"@modelcontextprotocol/sdk/server/mcp.js"`, `WebStandardStreamableHTTPServerTransport` from `"@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"` (`@modelcontextprotocol/sdk@1.32.2`)
4. **3-Worker Alternative**: If running 3 parallel workers instead of 4, combine Worker #1 and Worker #2 into a single Backend + MCP worker (`apps/server` + `skills/merak`).

---

## Worker #1: Backend Core (Auth, Spaces, Nodes, Media, Search, WS)

- **Owned Paths** (exclusive):
  - `apps/server/src/auth/**`
  - `apps/server/src/services/**` (except `types.ts`, only extend `index.ts` factory)
  - `apps/server/src/media/**`
  - `apps/server/src/routes/**`
  - `apps/server/src/ws/**`
  - `apps/server/src/__tests__/**`
  - Wire routes + WS into `apps/server/src/app.ts` during integration or via a single `mountCoreRoutes(app, services)` helper.
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
  3. `skills/merak/SKILL.md`: clear agent playbook covering Knowledge Base vs Project organization, child-node nesting, non-overlapping Excalidraw layout rules, self-contained HTML Artifact standards, and mandatory Media Gallery usage (never inline base64 images).
  4. MCP protocol tests (tool list, read/write scope enforcement, Excalidraw normalization, doc patching).

---

## Worker #3: Web Shell, Base UI + StyleX Primitives, Tree, Auth, Gallery & Search

- **Owned Paths** (exclusive):
  - `apps/web/src/ui/**`
  - `apps/web/src/layout/**`
  - `apps/web/src/features/**`
  - `apps/web/src/lib/ws.ts`
  - `apps/web/src/lib/auth-client.ts`
- **Deliverables**:
  1. Reusable UI primitives in `apps/web/src/ui/` built strictly with `@base-ui/react` + `@stylexjs/stylex` using `tokens.stylex.ts` (`Button`, `Dialog`, `Menu`, `Popover`, `Input`, `Badge`, `Toast`, `Tabs`).
  2. Auth & Team Space flows (`auth-client.ts` with `organizationClient()`): Sign-in / Sign-up, team switcher, invite member link/modal, MCP Token management UI (create with space/permission scope, copy once, revoke).
  3. Sidebar (`apps/web/src/layout/`): `Knowledge Base` + `Projects` sections, recursive Notion-style expandable node tree, inline create child (`doc` / `excalidraw` / `html` / `canvas`), `@dnd-kit/core` + `@dnd-kit/sortable` drag-and-drop reparenting and LexoRank reordering.
  4. Media Gallery view (`apps/web/src/features/gallery/`): filter by space, drag-and-drop upload, reference count & backlinks list, orphan cleanup, copy URL.
  5. `Cmd+K` Command Palette (`apps/web/src/features/search/`) hitting `/api/search` + WebSocket live sync (`apps/web/src/lib/ws.ts`) invalidating TanStack Query caches on remote MCP/teammate edits with conflict banner if editing a stale node.

---

## Worker #4: Four Asset Editors

- **Owned Paths** (exclusive):
  - `apps/web/src/editors/**`
- **Deliverables** (every editor strictly implements `AssetEditorProps` from `@merak/shared`):
  1. `MarkdownEditor.tsx` (BlockNote WYSIWYG):
     - Uses `@blocknote/core` + `@blocknote/react` + `@blocknote/ariakit` styled to match `tokens.stylex.ts` CSS variables.
     - Persists clean Markdown (`editor.blocksToMarkdownLossy` / `editor.tryParseMarkdownToBlocks`) — no proprietary JSON storage.
     - Custom Base UI + StyleX `/` slash menu items: `/subpage`, `/sub-excalidraw`, `/sub-html`, `/sub-canvas` (calls `onCreateChild` and inserts a clickable child card block), plus `/embed` (`::embed{node="<id>" height="460"}`) inline preview block using `resolveNode`.
     - Image paste/drop uploads via `onUploadMedia` and inserts `/api/media/<id>`.
  2. `ExcalidrawEditor.tsx`:
     - Wraps `@excalidraw/excalidraw` with `theme` sync, parses/serializes normalized JSON (`normalizeExcalidrawDocument`), intercepts pasted images to upload via `onUploadMedia`.
  3. `HtmlArtifactEditor.tsx`:
     - Split Preview / `CodeMirror 6` (`@codemirror/lang-html`) code pane + Desktop / Tablet / Mobile viewport switcher.
     - **Security boundary**: Preview `iframe` MUST use `sandbox="allow-scripts"` and **MUST NEVER** include `allow-same-origin`.
     - Explicit `theme` forwarding via `postMessage` (for Safari iframe `prefers-color-scheme` consistency) + runtime `console` / `window.onerror` bridge to display errors in an expandable bottom console bar.
  4. `CanvasEditor.tsx`:
     - Wraps `@xyflow/react` reading/writing JSON Canvas 1.0 (`jsonCanvasDocumentSchema`).
     - Supports text notes, groups, edges, and embedded `file` cards (`nodeId` / `mediaId`) with **LOD activation** (lightweight preview card when idle/zoomed out; interactive/openable on focus or double-click).
