import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, font, radius, space } from "../tokens.stylex.js";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  root: {
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    margin: "auto",
    padding: space.xxl,
    paddingBottom: "8vh",
    gap: space.sm,
    color: colors.textMuted,
  },
  iconBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "44px",
    borderRadius: radius.lg,
    backgroundColor: colors.bgSubtle,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    color: colors.textMuted,
    marginBottom: space.xs,
  },
  title: {
    margin: 0,
    fontSize: "17px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: colors.text,
  },
  description: {
    margin: 0,
    maxWidth: "390px",
    fontSize: "13.5px",
    lineHeight: 1.6,
    color: colors.textMuted,
  },
  action: {
    marginTop: space.md,
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
      {icon ? <div {...stylex.props(styles.iconBadge)}>{icon}</div> : null}
      <h3 {...stylex.props(styles.title)}>{title}</h3>
      {description ? <p {...stylex.props(styles.description)}>{description}</p> : null}
      {action ? <div {...stylex.props(styles.action)}>{action}</div> : null}
    </div>
  );
}
