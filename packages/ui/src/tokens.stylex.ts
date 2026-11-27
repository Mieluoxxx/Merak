import * as stylex from "@stylexjs/stylex";

const DARK = "@media (prefers-color-scheme: dark)" as const;

export const colors = stylex.defineVars({
  bg: { default: "#ffffff", [DARK]: "#111215" },
  bgSubtle: { default: "#f7f7f5", [DARK]: "#18191d" },
  bgElevated: { default: "#ffffff", [DARK]: "#1f2026" },
  bgHover: { default: "rgba(15, 23, 42, 0.05)", [DARK]: "rgba(255, 255, 255, 0.06)" },
  bgActive: { default: "rgba(15, 23, 42, 0.09)", [DARK]: "rgba(255, 255, 255, 0.11)" },
  border: { default: "#e4e4e0", [DARK]: "#2c2e36" },
  borderSubtle: { default: "#efefec", [DARK]: "#23252c" },
  text: { default: "#18181b", [DARK]: "#eceef2" },
  textMuted: { default: "#52525b", [DARK]: "#a1a6b3" },
  textSubtle: { default: "#8c8c94", [DARK]: "#6e7380" },
  accent: { default: "#2563eb", [DARK]: "#60a5fa" },
  accentText: { default: "#ffffff", [DARK]: "#0b1220" },
  accentSubtle: { default: "rgba(37, 99, 235, 0.1)", [DARK]: "rgba(96, 165, 250, 0.15)" },
  danger: { default: "#dc2626", [DARK]: "#f87171" },
  success: { default: "#16a34a", [DARK]: "#4ade80" },
  warning: { default: "#d97706", [DARK]: "#fbbf24" },
});

export const space = stylex.defineVars({
  xxs: "2px",
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
});

export const radius = stylex.defineVars({
  sm: "4px",
  md: "8px",
  lg: "12px",
  full: "9999px",
});

export const font = stylex.defineVars({
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
  mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  sizeXs: "12px",
  sizeSm: "13px",
  sizeMd: "14px",
  sizeLg: "16px",
  sizeXl: "20px",
});

export const shadow = stylex.defineVars({
  sm: { default: "0 1px 2px rgba(0, 0, 0, 0.05)", [DARK]: "0 1px 2px rgba(0, 0, 0, 0.4)" },
  md: { default: "0 4px 12px rgba(0, 0, 0, 0.08)", [DARK]: "0 4px 14px rgba(0, 0, 0, 0.5)" },
  lg: { default: "0 12px 32px rgba(0, 0, 0, 0.12)", [DARK]: "0 12px 32px rgba(0, 0, 0, 0.65)" },
});

export const zIndex = stylex.defineVars({
  dropdown: "100",
  sticky: "200",
  modal: "300",
  popover: "400",
  toast: "500",
});

export const lightTheme = stylex.createTheme(colors, {
  bg: "#ffffff",
  bgSubtle: "#f7f7f5",
  bgElevated: "#ffffff",
  bgHover: "rgba(15, 23, 42, 0.05)",
  bgActive: "rgba(15, 23, 42, 0.09)",
  border: "#e4e4e0",
  borderSubtle: "#efefec",
  text: "#18181b",
  textMuted: "#52525b",
  textSubtle: "#8c8c94",
  accent: "#2563eb",
  accentText: "#ffffff",
  accentSubtle: "rgba(37, 99, 235, 0.1)",
  danger: "#dc2626",
  success: "#16a34a",
  warning: "#d97706",
});

export const darkTheme = stylex.createTheme(colors, {
  bg: "#111215",
  bgSubtle: "#18191d",
  bgElevated: "#1f2026",
  bgHover: "rgba(255, 255, 255, 0.06)",
  bgActive: "rgba(255, 255, 255, 0.11)",
  border: "#2c2e36",
  borderSubtle: "#23252c",
  text: "#eceef2",
  textMuted: "#a1a6b3",
  textSubtle: "#6e7380",
  accent: "#60a5fa",
  accentText: "#0b1220",
  accentSubtle: "rgba(96, 165, 250, 0.15)",
  danger: "#f87171",
  success: "#4ade80",
  warning: "#fbbf24",
});
