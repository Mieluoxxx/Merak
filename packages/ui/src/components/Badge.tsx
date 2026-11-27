import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, font, radius, space } from "../tokens.stylex.js";

export interface BadgeProps {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    paddingBlock: space.xxs,
    paddingInline: space.sm,
    borderRadius: radius.full,
    fontSize: font.sizeXs,
    fontWeight: 500,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
  },
  neutral: {
    backgroundColor: colors.bgSubtle,
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
  },
  accent: {
    backgroundColor: colors.accentSubtle,
    color: colors.accent,
  },
  success: {
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    color: colors.success,
  },
  warning: {
    backgroundColor: "rgba(217, 119, 6, 0.14)",
    color: colors.warning,
  },
  danger: {
    backgroundColor: "rgba(220, 38, 38, 0.12)",
    color: colors.danger,
  },
});

const TONE_MAP = {
  neutral: styles.neutral,
  accent: styles.accent,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
} as const;

export function Badge({ tone = "neutral", children, xstyle }: BadgeProps) {
  return (
    <span data-slot="merak-badge" {...stylex.props(styles.base, TONE_MAP[tone], xstyle)}>
      {children}
    </span>
  );
}
