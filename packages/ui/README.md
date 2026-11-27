# `@merak/ui` — Merak Agent UI SDK

`@merak/ui` unifies Merak's application UI and Agent-generated interfaces on top of **Vercel Labs UI SDK** (`@ui-sdk/core`, `@ui-sdk/react`, `@ui-sdk/web`) + **StyleX** (`@stylexjs/stylex`).

## Usage in React (`apps/web`)

1. Import `@merak/ui/web.css` once in `main.tsx` (provides `@ui-sdk/core/web.css` defaults inside `@layer ui-sdk`).
2. Import primitives (`Button`, `Tabs`, `Tree`, `Menu`, `Dialog`, `Command`, `createAgent`, etc.) and composites (`ThemeScope`, `Stack`, `Inline`, `Card`, `Badge`, `EmptyState`) from `@merak/ui`.
3. Import StyleX design tokens (`colors`, `space`, `radius`, `font`, `shadow`, `zIndex`, `lightTheme`, `darkTheme`) from `@merak/ui/tokens.stylex`.

## Agent Bridge (`@ui-sdk/react/agent`)

`createAgent`, `agentTools`, and `registerTools` are re-exported directly from `@merak/ui`, giving AI agents structured `snapshot()`, `query()`, and `act()` tools over every `@ui-sdk/react` component on the page.

## Usage in Sandboxed HTML Artifacts

HTML Artifacts automatically receive:
- `/ui-sdk/web.css` (UI SDK default stylesheet)
- `/ui-sdk/merak-ui.css` (Merak token variables + `.mk-*` helpers)
- `/ui-sdk/merak-artifact.js` (theme sync & `console` / `merak:action` postMessage bridge)
- `/ui-sdk/manifest.json` (machine-readable UI SDK capability manifest)
