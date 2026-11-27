/**
 * Merak Artifact CSS layered on top of Vercel Labs UI SDK (`/ui-sdk/web.css`).
 * Provides semantic layout & surface helpers aligned with `tokens.stylex.ts`.
 */
export const MERAK_ARTIFACT_CSS = `:root {
  --lightningcss-light: initial;
  --lightningcss-dark: ;
  color-scheme: light dark;
  --mk-bg: light-dark(#ffffff, #111215);
  --mk-bg-subtle: light-dark(#f7f7f5, #18191d);
  --mk-bg-elevated: light-dark(#ffffff, #1f2026);
  --mk-border: light-dark(#e4e4e0, #2c2e36);
  --mk-text: light-dark(#18181b, #eceef2);
  --mk-text-muted: light-dark(#52525b, #a1a6b3);
  --mk-accent: light-dark(#2563eb, #60a5fa);
  --mk-accent-text: light-dark(#ffffff, #0b1220);
  --mk-accent-subtle: light-dark(rgba(37, 99, 235, 0.1), rgba(96, 165, 250, 0.15));
  --mk-success: light-dark(#16a34a, #4ade80);
  --mk-warning: light-dark(#d97706, #fbbf24);
  --mk-danger: light-dark(#dc2626, #f87171);
  --mk-radius: 8px;
  --mk-radius-sm: 4px;
  --mk-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  --mk-font-mono: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace;

  /* Align UI SDK CSS variables with Merak palette */
  --ui-background: var(--mk-bg);
  --ui-foreground: var(--mk-text);
  --ui-muted: var(--mk-bg-subtle);
  --ui-muted-foreground: var(--mk-text-muted);
  --ui-border: var(--mk-border);
  --ui-radius: 6px;
}

[data-theme="light"] {
  color-scheme: light;
  --lightningcss-light: initial;
  --lightningcss-dark: ;
}

[data-theme="dark"] {
  color-scheme: dark;
  --lightningcss-light: ;
  --lightningcss-dark: initial;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--mk-bg);
  color: var(--mk-text);
  font-family: var(--mk-font-sans);
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.mk-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

.mk-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mk-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.mk-card {
  background: var(--mk-bg-elevated);
  border: 1px solid var(--mk-border);
  border-radius: var(--mk-radius);
  padding: 16px;
}

.mk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--mk-border);
  background: var(--mk-bg-elevated);
  color: var(--mk-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.mk-btn:hover {
  background: var(--mk-bg-subtle);
}

.mk-btn-primary {
  background: var(--mk-accent);
  border-color: var(--mk-accent);
  color: var(--mk-accent-text);
}

.mk-btn-primary:hover {
  opacity: 0.92;
  background: var(--mk-accent);
}

.mk-btn-ghost {
  background: transparent;
  border-color: transparent;
}

.mk-btn-danger {
  color: var(--mk-danger);
  border-color: var(--mk-danger);
  background: transparent;
}

.mk-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--mk-border);
  background: var(--mk-bg);
  color: var(--mk-text);
  font: inherit;
  font-size: 13px;
}

.mk-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: var(--mk-bg-subtle);
  color: var(--mk-text-muted);
  border: 1px solid var(--mk-border);
}

.mk-badge-accent {
  background: var(--mk-accent-subtle);
  color: var(--mk-accent);
  border-color: transparent;
}

.mk-badge-success {
  background: rgba(22, 163, 74, 0.14);
  color: var(--mk-success);
  border-color: transparent;
}

.mk-badge-warning {
  background: rgba(217, 119, 6, 0.14);
  color: var(--mk-warning);
  border-color: transparent;
}

.mk-badge-danger {
  background: rgba(220, 38, 38, 0.14);
  color: var(--mk-danger);
  border-color: transparent;
}

.mk-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.mk-table th,
.mk-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--mk-border);
}

.mk-table th {
  color: var(--mk-text-muted);
  font-weight: 600;
}

.mk-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 6px;
  background: var(--mk-bg-subtle);
  border: 1px solid var(--mk-border);
}

.mk-tab {
  padding: 4px 10px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--mk-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.mk-tab[aria-selected="true"] {
  background: var(--mk-bg-elevated);
  color: var(--mk-text);
  font-weight: 500;
}

.mk-muted {
  color: var(--mk-text-muted);
}

.mk-code {
  font-family: var(--mk-font-mono);
  font-size: 12px;
  background: var(--mk-bg-subtle);
  padding: 2px 5px;
  border-radius: 4px;
}
`;
