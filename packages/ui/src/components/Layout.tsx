import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { space } from "../tokens.stylex.js";

type GapToken = "none" | "xxs" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

export interface FlexProps {
  gap?: GapToken;
  align?: "stretch" | "start" | "center" | "end" | "baseline";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  stack: {
    display: "flex",
    flexDirection: "column",
  },
  inline: {
    display: "flex",
    flexDirection: "row",
  },
  wrap: {
    flexWrap: "wrap",
  },
  gapNone: { gap: 0 },
  gapXxs: { gap: space.xxs },
  gapXs: { gap: space.xs },
  gapSm: { gap: space.sm },
  gapMd: { gap: space.md },
  gapLg: { gap: space.lg },
  gapXl: { gap: space.xl },
  gapXxl: { gap: space.xxl },
  alignStretch: { alignItems: "stretch" },
  alignStart: { alignItems: "flex-start" },
  alignCenter: { alignItems: "center" },
  alignEnd: { alignItems: "flex-end" },
  alignBaseline: { alignItems: "baseline" },
  justifyStart: { justifyContent: "flex-start" },
  justifyCenter: { justifyContent: "center" },
  justifyEnd: { justifyContent: "flex-end" },
  justifyBetween: { justifyContent: "space-between" },
});

const GAP_MAP = {
  none: styles.gapNone,
  xxs: styles.gapXxs,
  xs: styles.gapXs,
  sm: styles.gapSm,
  md: styles.gapMd,
  lg: styles.gapLg,
  xl: styles.gapXl,
  xxl: styles.gapXxl,
} as const;

const ALIGN_MAP = {
  stretch: styles.alignStretch,
  start: styles.alignStart,
  center: styles.alignCenter,
  end: styles.alignEnd,
  baseline: styles.alignBaseline,
} as const;

const JUSTIFY_MAP = {
  start: styles.justifyStart,
  center: styles.justifyCenter,
  end: styles.justifyEnd,
  between: styles.justifyBetween,
} as const;

export function Stack({
  gap = "md",
  align = "stretch",
  justify = "start",
  children,
  xstyle,
}: FlexProps) {
  return (
    <div
      {...stylex.props(
        styles.stack,
        GAP_MAP[gap],
        ALIGN_MAP[align],
        JUSTIFY_MAP[justify],
        xstyle,
      )}
    >
      {children}
    </div>
  );
}

export function Inline({
  gap = "sm",
  align = "center",
  justify = "start",
  wrap = false,
  children,
  xstyle,
}: FlexProps) {
  return (
    <div
      {...stylex.props(
        styles.inline,
        GAP_MAP[gap],
        ALIGN_MAP[align],
        JUSTIFY_MAP[justify],
        wrap && styles.wrap,
        xstyle,
      )}
    >
      {children}
    </div>
  );
}
