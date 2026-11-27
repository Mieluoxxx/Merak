import type { WsServerEvent } from "@merak/shared";
import { Badge, Button, Inline } from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

export type StaleConflictEvent = Extract<WsServerEvent, { type: "node.updated" | "node.deleted" }>;

export interface StaleConflictBannerProps {
  conflict: StaleConflictEvent | null;
  onReloadRemote: () => void | Promise<void>;
  onDismiss: () => void;
  xstyle?: stylex.StyleXStyles;
}

const styles = stylex.create({
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    backgroundColor: "rgba(217, 119, 6, 0.12)",
    borderBottom: `1px solid ${colors.warning}`,
    color: colors.text,
    fontSize: font.sizeSm,
    flexWrap: "wrap",
  },
  messageGroup: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    minWidth: 0,
    flex: "1 1 280px",
  },
  icon: {
    color: colors.warning,
    flexShrink: 0,
  },
  text: {
    margin: 0,
    lineHeight: 1.4,
    color: colors.text,
  },
  subtext: {
    color: colors.textMuted,
    fontSize: font.sizeXs,
  },
  reloadButton: {
    borderRadius: radius.sm,
  },
});

export function StaleConflictBanner({
  conflict,
  onReloadRemote,
  onDismiss,
  xstyle,
}: StaleConflictBannerProps) {
  if (!conflict) return null;

  const isDeleted = conflict.type === "node.deleted";
  const headline = isDeleted
    ? "This document was deleted remotely by another collaborator or MCP agent."
    : `This document was updated remotely (version ${conflict.version}).`;

  return (
    <div
      role="alert"
      data-slot="merak-stale-conflict-banner"
      {...stylex.props(styles.banner, xstyle)}
    >
      <div {...stylex.props(styles.messageGroup)}>
        <AlertTriangle size={16} {...stylex.props(styles.icon)} />
        <div>
          <p {...stylex.props(styles.text)}>{headline}</p>
          <span {...stylex.props(styles.subtext)}>
            {isDeleted
              ? "Save a copy locally or reload to sync with the latest workspace state."
              : "You have unsaved edits. Reloading will replace local changes with the remote version."}
          </span>
        </div>
        <Badge tone="warning">
          {isDeleted ? "Deleted remotely" : `v${conflict.version}`}
        </Badge>
      </div>

      <Inline gap="xs">
        <Button
          data-variant="solid"
          onClick={() => onReloadRemote()}
          {...stylex.props(styles.reloadButton)}
        >
          <RefreshCw size={14} />
          <span>{isDeleted ? "Sync Workspace" : "Reload Remote"}</span>
        </Button>
        <Button onClick={onDismiss} aria-label="Dismiss conflict notice">
          <X size={14} />
          <span>Keep Editing</span>
        </Button>
      </Inline>
    </div>
  );
}
