import * as stylex from "@stylexjs/stylex";

const DARK = "@media (prefers-color-scheme: dark)" as const;

export const colors = stylex.defineVars({
  bg: { default: "#ffffff", [DARK]: "#191919" },
  bgSubtle: { default: "#f8f8f7", [DARK]: "#202020" },
  bgElevated: { default: "#ffffff", [DARK]: "#252525" },
  bgHover: { default: "rgba(55, 53, 47, 0.055)", [DARK]: "rgba(255, 255, 255, 0.055)" },
  bgActive: { default: "rgba(55, 53, 47, 0.085)", [DARK]: "rgba(255, 255, 255, 0.085)" },
  border: { default: "rgba(55, 53, 47, 0.14)", [DARK]: "#383836" },
  borderSubtle: { default: "rgba(55, 53, 47, 0.08)", [DARK]: "#2c2c2b" },
  text: { default: "#37352f", [DARK]: "#f0efed" },
  textMuted: { default: "#787774", [DARK]: "#ada9a3" },
  textSubtle: { default: "#9b9a97", [DARK]: "#7d7a75" },
  accent: { default: "#2383e2", [DARK]: "#4e94ec" },
  accentText: { default: "#ffffff", [DARK]: "#191919" },
  accentSubtle: { default: "rgba(35, 131, 226, 0.1)", [DARK]: "rgba(78, 148, 236, 0.16)" },
  danger: { default: "#d44c47", [DARK]: "#eb5757" },
  success: { default: "#448361", [DARK]: "#4dab9a" },
  warning: { default: "#d9730d", [DARK]: "#ffa344" },
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
  sans: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Inter, Roboto, sans-serif',
  mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  sizeXs: "12px",
  sizeSm: "13px",
  sizeMd: "14px",
  sizeLg: "16px",
  sizeXl: "20px",
});

export const shadow = stylex.defineVars({
  sm: { default: "0 1px 2px rgba(15, 15, 15, 0.05)", [DARK]: "0 1px 2px rgba(0, 0, 0, 0.35)" },
  md: {
    default: "0 0 0 1px rgba(15, 15, 15, 0.06), 0 8px 20px rgba(15, 15, 15, 0.1)",
    [DARK]:
      "0 0 0 1px #383836, 0 14px 28px -6px rgba(0, 0, 0, 0.38), 0 2px 4px -1px rgba(0, 0, 0, 0.22)",
  },
  lg: {
    default: "0 0 0 1px rgba(15, 15, 15, 0.06), 0 18px 40px rgba(15, 15, 15, 0.16)",
    [DARK]: "0 0 0 1px #383836, 0 20px 44px rgba(0, 0, 0, 0.55)",
  },
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
  bgSubtle: "#f8f8f7",
  bgElevated: "#ffffff",
  bgHover: "rgba(55, 53, 47, 0.055)",
  bgActive: "rgba(55, 53, 47, 0.085)",
  border: "rgba(55, 53, 47, 0.14)",
  borderSubtle: "rgba(55, 53, 47, 0.08)",
  text: "#37352f",
  textMuted: "#787774",
  textSubtle: "#9b9a97",
  accent: "#2383e2",
  accentText: "#ffffff",
  accentSubtle: "rgba(35, 131, 226, 0.1)",
  danger: "#d44c47",
  success: "#448361",
  warning: "#d9730d",
});

export const darkTheme = stylex.createTheme(colors, {
  bg: "#191919",
  bgSubtle: "#202020",
  bgElevated: "#252525",
  bgHover: "rgba(255, 255, 255, 0.055)",
  bgActive: "rgba(255, 255, 255, 0.085)",
  border: "#383836",
  borderSubtle: "#2c2c2b",
  text: "#f0efed",
  textMuted: "#ada9a3",
  textSubtle: "#7d7a75",
  accent: "#4e94ec",
  accentText: "#191919",
  accentSubtle: "rgba(78, 148, 236, 0.16)",
  danger: "#eb5757",
  success: "#4dab9a",
  warning: "#ffa344",
});
