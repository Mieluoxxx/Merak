import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { darkTheme, lightTheme } from "../tokens.stylex.js";

export type ThemeMode = "system" | "light" | "dark";

export interface ThemeScopeProps {
  theme?: ThemeMode;
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  root: {
    display: "contents",
  },
});

export function ThemeScope({ theme = "system", children, xstyle }: ThemeScopeProps) {
  const themeClass =
    theme === "light" ? lightTheme : theme === "dark" ? darkTheme : undefined;

  return (
    <div
      data-theme={theme === "system" ? undefined : theme}
      {...stylex.props(themeClass, styles.root, xstyle)}
    >
      {children}
    </div>
  );
}
