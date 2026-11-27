import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, font, space } from "../tokens.stylex.js";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: space.xxl,
    gap: space.sm,
    color: colors.textMuted,
  },
  icon: {
    color: colors.textSubtle,
    marginBottom: space.xs,
  },
  title: {
    margin: 0,
    fontSize: font.sizeMd,
    fontWeight: 600,
    color: colors.text,
  },
  description: {
    margin: 0,
    maxWidth: "360px",
    fontSize: font.sizeSm,
    lineHeight: 1.5,
    color: colors.textMuted,
  },
  action: {
    marginTop: space.sm,
  },
});

export function EmptyState({
  icon,
  title,
  description,
  action,
  xstyle,
}: EmptyStateProps) {
  return (
    <div data-slot="merak-empty-state" {...stylex.props(styles.root, xstyle)}>
      {icon ? <div {...stylex.props(styles.icon)}>{icon}</div> : null}
      <h3 {...stylex.props(styles.title)}>{title}</h3>
      {description ? <p {...stylex.props(styles.description)}>{description}</p> : null}
      {action ? <div {...stylex.props(styles.action)}>{action}</div> : null}
    </div>
  );
}
