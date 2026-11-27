import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, radius, shadow, space } from "../tokens.stylex.js";

export interface CardProps {
  variant?: "elevated" | "subtle" | "bordered";
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  base: {
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    color: colors.text,
  },
  elevated: {
    backgroundColor: colors.bgElevated,
    boxShadow: shadow.sm,
  },
  subtle: {
    backgroundColor: colors.bgSubtle,
  },
  bordered: {
    backgroundColor: colors.bg,
  },
  padNone: { padding: 0 },
  padSm: { padding: space.sm },
  padMd: { padding: space.lg },
  padLg: { padding: space.xl },
});

const VARIANT_MAP = {
  elevated: styles.elevated,
  subtle: styles.subtle,
  bordered: styles.bordered,
} as const;

const PAD_MAP = {
  none: styles.padNone,
  sm: styles.padSm,
  md: styles.padMd,
  lg: styles.padLg,
} as const;

export function Card({
  variant = "elevated",
  padding = "md",
  children,
  xstyle,
}: CardProps) {
  return (
    <div
      data-slot="merak-card"
      {...stylex.props(styles.base, VARIANT_MAP[variant], PAD_MAP[padding], xstyle)}
    >
      {children}
    </div>
  );
}
