---
name: merak
description: Playbook for AI agents interacting with a Merak collaborative workspace via MCP. Covers Knowledge Base vs Project organization, hierarchical node nesting and embeds, safe Markdown patching, non-overlapping Excalidraw diagrams, sandboxed HTML Artifacts using @merak/ui, JSON Canvas 1.0 boards, and mandatory Media Gallery asset uploads.
---

# Merak Agent Playbook

Use this playbook whenever you read, author, organize, or publish assets in a **Merak** workspace over its Streamable HTTP MCP endpoint (`/mcp`).

---

## 1. Discovery & Scope Discipline

Before mutating workspace content:

1. Call `list_spaces` to discover accessible spaces (`kind: "knowledge"` vs `"project"`).
2. Call `get_tree` on the target `spaceId` or `search_workspace` to avoid creating duplicate pages or boards.
3. Call `read_node` before editing an existing node so you have the latest `version` for optimistic concurrency (`expectedVersion`).
4. Respect token scopes:
   - Tokens may be restricted to `permission: "read"` (all mutation tools will return `FORBIDDEN_SCOPE`) or specific `spaceIds`.
   - Never assume access to spaces outside `list_spaces`.
5. Before authoring any HTML Artifact, call `get_ui_sdk_manifest` (or read resource `merak://ui-sdk/manifest`) to verify available `.mk-*` utility classes, CSS tokens, and `/ui-sdk/*` endpoints.

---

## 2. Space Organization: Knowledge Base vs Projects

Merak separates durable reference knowledge from active execution work:

| Space `kind` | Purpose | Typical Contents |
| --- | --- | --- |
| `knowledge` | Durable, evergreen team documentation | Architecture Decision Records (ADRs), engineering handbooks, API contracts, runbooks, design system specs, onboarding guides |
| `project` | Time-bound initiatives, RFCs, product launches, sprints | Project briefs, milestones, prototypes (HTML Artifacts), system diagrams (Excalidraw), discovery boards (JSON Canvas), meeting notes |

### Placement Guidelines

- Put **long-lived truth** (standards, architecture, reference docs) in a `knowledge` space.
- Put **active initiative deliverables** (specs, mockups, sprint boards, prototypes) in a `project` space.
- When a project ships and its findings become permanent team knowledge, summarize or link the canonical reference doc in the `knowledge` space.

---

## 3. Child-Node Nesting & Inline Embeds

Merak supports Notion-style recursive nesting across **all four asset types** (`doc`, `excalidraw`, `html`, `canvas`). Any node can be a parent via `parentId`.

### Nesting Patterns

- Create a parent `doc` (e.g. "Payment Service Architecture") and nest supporting artifacts directly beneath it via `parentId`:
  - `doc` → Specification / ADR prose
  - `excalidraw` → System topology or sequence diagram
  - `html` → Interactive prototype, state explorer, or live metrics mockup
  - `canvas` → Spatial overview board linking all related docs and media
- Reorder or reparent nodes cleanly with `move_node` using `parentId`, `beforeNodeId`, and/or `afterNodeId` (never fabricate raw LexoRank strings manually).

### Embedding Assets Inside Markdown Docs

To embed any child or sibling node inline inside a Markdown `doc`, use Merak's canonical embed directive syntax:

```markdown
::embed{node="<nodeId>" height="460"}
```

- Always use real node IDs returned by `create_node`, `upsert_excalidraw`, `publish_html_artifact`, `upsert_canvas`, or `get_tree`.
- Choose sensible heights:
  - Diagrams (`excalidraw`): `420`–`560`
  - Interactive UI prototypes (`html`): `480`–`680`
  - Overview boards (`canvas`): `520`–`720`

---

## 4. Markdown Document Editing Best Practices

1. **Prefer `patch_doc` over `update_node`** when modifying an existing Markdown document:
   - `patch_doc` performs an exact find-and-replace (`find` → `replace`) and minimizes risk of clobbering concurrent human edits.
   - Always include enough surrounding context in `find` to make the match unique (unless intentionally using `replaceAll: true`).
2. **Always pass `expectedVersion`** (obtained from `read_node`) on `patch_doc` and `update_node` so concurrent edits surface a clean conflict instead of silently overwriting a teammate's work.
3. Use `update_node` only when rewriting a document wholesale or changing `title` / `icon`.
4. Keep Markdown clean and portable (standard headings, tables, fenced code blocks, `::embed{...}`, and `/api/media/<id>` image links).

---

## 5. Non-Overlapping Excalidraw Diagram Layout Rules

**ALWAYS use `upsert_excalidraw`** (never raw `create_node` / `update_node` for Excalidraw scenes). `upsert_excalidraw` runs `normalizeExcalidrawDocument` to populate required Excalidraw v2 fields (`version`, `seed`, `versionNonce`, `roundness`, `points`, valid bindings, and `appState`) so LLM-generated JSON never crashes the Excalidraw canvas.

### Spatial Layout Rules (Prevent Overlapping Elements)

Follow strict grid math when generating coordinates:

1. **Snap to a 20px grid** (`appState.gridSize: 20`). Place top-level elements starting around `(x: 80, y: 80)`.
2. **Size containers generously for their labels**:
   - Standard box: `width: 220`–`280`, `height: 80`–`100`.
   - Formula for text width: `max(180, longestLineChars * fontSize * 0.65 + 48)`.
   - Formula for text height: `max(72, lineCount * fontSize * 1.4 + 36)`.
   - Never cram multi-line labels into tiny boxes (`height < 60`).
3. **Enforce minimum whitespace gaps**:
   - Horizontal gap between sibling boxes: **at least `80px`–`120px`** (`nextX = prevX + prevWidth + 100`).
   - Vertical gap between tiers/rows: **at least `100px`–`140px`** (`nextY = prevY + prevHeight + 120`).
   - Group/frame padding around inner elements: **at least `40px` on every side** (and `56px` at the top for a group header label).
4. **Keep text labels inside shapes centered and explicitly bounded**:
   - Place standalone text at `x = box.x + 16`, `y = box.y + (box.height - textHeight) / 2`, `width = box.width - 32`, `textAlign: "center"`, or bind it via `boundElements: [{ id: "<textId>", type: "text" }]` + `containerId`.
5. **Connect arrows cleanly with explicit IDs and bindings**:
   - Assign deterministic, readable IDs to every shape (e.g. `"api-gw"`, `"auth-svc"`, `"db-primary"`).
   - Start arrows from the **edge** of the source shape (e.g. right edge `x = src.x + src.width`, `y = src.y + src.height / 2`) and end at the **edge** of the target shape (`points: [[0, 0], [dx, dy]]`).
   - Set `startBinding: { elementId: "api-gw", focus: 0, gap: 6 }` and `endBinding: { elementId: "auth-svc", focus: 0, gap: 6 }`, and list the arrow in both shapes' `boundElements: [{ id: "<arrowId>", type: "arrow" }]`.
   - Route arrows through open corridors — never draw an arrow straight through an unrelated box.
6. **Use a restrained, readable palette**:
   - Soft fills (`#e7f5ff`, `#ebfbee`, `#fff9db`, `#f3f0ff`, `#fff5f5`) with dark readable strokes (`#1e1e1e`, `#1971c2`, `#2f9e44`, `#e8590c`).

---

## 6. Self-Contained HTML Artifact Conventions

**ALWAYS use `publish_html_artifact`** to create or update `html` nodes.

### Mandatory `@merak/ui` Asset Links

Every HTML Artifact **MUST** link Merak's shared UI SDK runtime in `<head>` (and call `get_ui_sdk_manifest` if you need to check available classes):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Interactive Prototype</title>
    <link rel="stylesheet" href="/ui-sdk/web.css" />
    <link rel="stylesheet" href="/ui-sdk/merak-ui.css" />
    <script src="/ui-sdk/merak-artifact.js"></script>
  </head>
  <body>
    <main class="mk-page mk-stack">
      <div class="mk-row">
        <h1>Prototype Title</h1>
        <span class="mk-badge mk-badge-accent">Draft</span>
      </div>
      <section class="mk-card mk-stack">
        <p class="mk-muted">Built with Merak UI SDK tokens and classes.</p>
        <button class="mk-btn mk-btn-primary" type="button">Primary Action</button>
      </section>
    </main>
  </body>
</html>
```

### Design Tokens & Utility Classes

- Prefer Merak's built-in `.mk-*` classes:
  - Layout: `mk-page`, `mk-stack`, `mk-row`, `mk-grid`, `mk-card`
  - Controls: `mk-btn`, `mk-btn-primary`, `mk-btn-ghost`, `mk-btn-danger`, `mk-input`, `mk-tabs`, `mk-tab`
  - Data & Status: `mk-table`, `mk-badge`, `mk-badge-accent`, `mk-badge-success`, `mk-badge-warning`, `mk-badge-danger`, `mk-muted`, `mk-code`
- Use CSS custom properties (`var(--mk-bg)`, `var(--mk-bg-subtle)`, `var(--mk-bg-elevated)`, `var(--mk-border)`, `var(--mk-text)`, `var(--mk-text-muted)`, `var(--mk-accent)`, `var(--mk-accent-text)`, `var(--mk-success)`, `var(--mk-warning)`, `var(--mk-danger)`, `var(--mk-radius)`, `var(--mk-font-sans)`, `var(--mk-font-mono)`) instead of hardcoded light-only colors so dark mode works seamlessly.

### Theme Synchronization & Sandbox Constraints

Merak renders HTML Artifacts inside `<iframe sandbox="allow-scripts">` (**without `allow-same-origin`**):

1. **Theme sync**: `/ui-sdk/merak-artifact.js` automatically handles inbound `window.postMessage({ type: "merak:theme", theme: "light" | "dark" })` by setting `document.documentElement.dataset.theme` and `color-scheme`. If you draw custom `<canvas>` / SVG charts, listen for `merak:theme` messages and re-render using computed `var(--mk-*)` values.
2. **NO external unbundled dependencies**: Do not load Tailwind CDN, React CDN, Google Fonts, or external `<script src="https://...">` libraries. Write clean, self-contained vanilla HTML, CSS, and ES2023 JavaScript.
3. **NO same-origin storage or API fetches**: Inside `sandbox="allow-scripts"` (opaque origin), `localStorage`, `sessionStorage`, `document.cookie`, and authenticated same-origin `fetch("/api/...")` calls will fail with `SecurityError` or CORS/auth errors. Keep interactive state in memory and embed public `/api/media/<id>` URLs via `<img src="/api/media/<id>">` only.
4. **Console forwarding**: `console.warn`, `console.error`, and uncaught exceptions are automatically forwarded to the workbench console bar via `merak:console`. Keep artifacts error-free.

---

## 7. JSON Canvas 1.0 Conventions

**ALWAYS use `upsert_canvas`** to create or update `canvas` nodes. `upsert_canvas` validates against `jsonCanvasDocumentSchema` (JSON Canvas 1.0), verifies all edge endpoints exist, and confirms every referenced workspace `nodeId` exists and is accessible in scope.

### Structure & Merak Extensions

```json
{
  "nodes": [
    {
      "id": "group-core",
      "type": "group",
      "x": 0,
      "y": 0,
      "width": 920,
      "height": 420,
      "label": "Core Architecture"
    },
    {
      "id": "card-spec",
      "type": "file",
      "file": "architecture-spec.md",
      "nodeId": "<existing-doc-node-id>",
      "x": 40,
      "y": 60,
      "width": 360,
      "height": 280
    },
    {
      "id": "card-note",
      "type": "text",
      "text": "## Key Risks\n- Latency budget < 120ms\n- Idempotent retries",
      "x": 460,
      "y": 60,
      "width": 360,
      "height": 280,
      "color": "3"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "fromNode": "card-spec",
      "fromSide": "right",
      "toNode": "card-note",
      "toSide": "left",
      "toEnd": "arrow",
      "label": "tracks"
    }
  ]
}
```

- Link workspace nodes using `type: "file"` with both a human-readable `file` label and Merak's `nodeId: "<nodeId>"` extension.
- Link uploaded Media Gallery images using `type: "file"`, `file: "/api/media/<mediaId>"`, and `mediaId: "<mediaId>"`.
- Maintain clear spatial spacing (at least `60px` gap between cards, `40px` padding inside `group` nodes) and always specify `fromSide` / `toSide` so edges route cleanly without crossing cards.

---

## 8. Mandatory Media Gallery Usage (NEVER Inline Base64 Images)

Merak provides a SHA-256 deduplicated **Media Gallery** with automatic backlink tracking and immutable caching.

### Strict Rules

1. **NEVER embed inline `data:image/...;base64,...` strings** in:
   - Markdown docs (`![alt](data:image/...)`)
   - Excalidraw scenes (`files[...].dataURL`)
   - HTML Artifacts (`<img src="data:image/...">` or CSS `url(data:image/...)`)
   - JSON Canvas cards
2. **ALWAYS upload images and binary assets first using `upload_media`**:
   - Pass `filename`, `mimeType`, optional `spaceId`, and either `base64Data` or `sourceUrl`.
   - `upload_media` deduplicates identical payloads by SHA-256 and returns `{ media, url: "/api/media/<id>" }`.
3. **Reference the returned `/api/media/<id>` URL** everywhere:
   - Markdown: `![Architecture diagram](/api/media/<id>)`
   - HTML Artifact: `<img src="/api/media/<id>" alt="Architecture diagram" />`
   - JSON Canvas: `{ "type": "file", "file": "/api/media/<id>", "mediaId": "<id>", ... }`
4. Call `list_media` to reuse existing uploaded assets in the workspace before uploading duplicates.
