import { colors, font, radius, shadow } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { NodeToolbar, Position } from "@xyflow/react";
import {
  BoxSelect,
  CopyPlus,
  FileText,
  Link2,
  LocateFixed,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react";
import { useEffect } from "react";
import { CANVAS_NODE_COLORS } from "./canvasOps.js";

export interface CanvasNodeActionPillProps {
  isVisible: boolean;
  currentColor?: string;
  isGroup: boolean;
  onSelectColor: (color?: string) => void;
  onUngroup?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export interface CanvasMultiSelectBarProps {
  selectedCount: number;
  readOnly: boolean;
  onGroupSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
}

export type CanvasContextTarget =
  | { kind: "pane"; screenX: number; screenY: number; flowX: number; flowY: number }
  | { kind: "node"; screenX: number; screenY: number; nodeId: string; isGroup: boolean };

export interface CanvasContextMenuProps {
  menu: CanvasContextTarget | null;
  selectedCount: number;
  onClose: () => void;
  onAddTextAt: (x: number, y: number) => void;
  onAddGroupAt: (x: number, y: number) => void;
  onOpenLinkDialog: () => void;
  onOpenEmbedDialog: () => void;
  onFitView: () => void;
  onDuplicateNode: (nodeId: string) => void;
  onGroupSelected: () => void;
  onUngroupNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}

const styles = stylex.create({
  nodePill: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    height: "34px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "8px",
    paddingRight: "6px",
    borderRadius: "10px",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.md,
  },
  colorDotBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "16px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderRadius: radius.full,
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  colorDotBtnActive: {
    borderColor: colors.text,
  },
  colorDotInner: {
    width: "10px",
    height: "10px",
    borderRadius: radius.full,
  },
  pillDivider: {
    width: "1px",
    height: "16px",
    marginLeft: "3px",
    marginRight: "3px",
    backgroundColor: colors.borderSubtle,
  },
  pillIconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
    },
    cursor: "pointer",
  },
  pillDangerBtn: {
    color: {
      default: colors.danger,
      ":hover": colors.danger,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": "rgba(225, 98, 89, 0.14)",
    },
  },
  batchBar: {
    position: "absolute",
    top: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 46,
    display: "flex",
    alignItems: "center",
    gap: "4px",
    height: "36px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "10px",
    paddingRight: "6px",
    borderRadius: "10px",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.lg,
  },
  batchCount: {
    fontSize: "12px",
    fontWeight: 600,
    color: colors.textMuted,
    paddingRight: "4px",
    userSelect: "none",
  },
  batchActionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    height: "26px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "8px",
    paddingRight: "8px",
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.text,
    fontFamily: font.sans,
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
  },
  batchDangerBtn: {
    color: colors.danger,
    backgroundColor: {
      default: "transparent",
      ":hover": "rgba(225, 98, 89, 0.14)",
    },
  },
  contextMenu: {
    position: "fixed",
    zIndex: 90,
    minWidth: "184px",
    paddingTop: "5px",
    paddingBottom: "5px",
    paddingLeft: "4px",
    paddingRight: "4px",
    borderRadius: "10px",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.lg,
    display: "flex",
    flexDirection: "column",
  },
  contextRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    width: "100%",
    height: "28px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "8px",
    paddingRight: "8px",
    borderWidth: 0,
    borderRadius: "6px",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.text,
    fontFamily: font.sans,
    fontSize: "12.5px",
    cursor: "pointer",
  },
  contextRowLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  contextIcon: {
    display: "inline-flex",
    alignItems: "center",
    color: colors.textMuted,
  },
  contextDangerRow: {
    color: colors.danger,
  },
  contextShortcut: {
    fontSize: "11px",
    color: colors.textMuted,
  },
  contextDivider: {
    height: "1px",
    marginTop: "4px",
    marginBottom: "4px",
    marginLeft: "-4px",
    marginRight: "-4px",
    backgroundColor: colors.borderSubtle,
  },
});

export function CanvasNodeActionPill({
  isVisible,
  currentColor,
  isGroup,
  onSelectColor,
  onUngroup,
  onDuplicate,
  onDelete,
}: CanvasNodeActionPillProps) {
  const normalizedCurrent = currentColor ?? "default";

  return (
    <NodeToolbar isVisible={isVisible} position={Position.Top} offset={10}>
      <div
        data-merak-canvas-node-toolbar="true"
        className="nodrag nopan"
        onPointerDown={(event) => event.stopPropagation()}
        {...stylex.props(styles.nodePill)}
      >
        {CANVAS_NODE_COLORS.map((color) => {
          const active = normalizedCurrent === color.id;
          return (
            <button
              key={color.id}
              type="button"
              aria-label={`Set color ${color.label}`}
              title={color.label}
              onClick={() => onSelectColor(color.id === "default" ? undefined : color.id)}
              {...stylex.props(styles.colorDotBtn, active && styles.colorDotBtnActive)}
            >
              <span
                style={{ backgroundColor: color.dot }}
                {...stylex.props(styles.colorDotInner)}
              />
            </button>
          );
        })}

        <span aria-hidden="true" {...stylex.props(styles.pillDivider)} />

        {isGroup && onUngroup ? (
          <button
            type="button"
            aria-label="Ungroup"
            title="Ungroup (⌘⇧G)"
            onClick={onUngroup}
            {...stylex.props(styles.pillIconBtn)}
          >
            <Ungroup size={14} />
          </button>
        ) : null}

        <button
          type="button"
          aria-label="Duplicate node"
          title="Duplicate (⌘D)"
          onClick={onDuplicate}
          {...stylex.props(styles.pillIconBtn)}
        >
          <CopyPlus size={14} />
        </button>

        <button
          type="button"
          aria-label="Delete node"
          title="Delete (Del)"
          onClick={onDelete}
          {...stylex.props(styles.pillIconBtn, styles.pillDangerBtn)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </NodeToolbar>
  );
}

export function CanvasMultiSelectBar({
  selectedCount,
  readOnly,
  onGroupSelected,
  onDuplicateSelected,
  onDeleteSelected,
}: CanvasMultiSelectBarProps) {
  if (readOnly || selectedCount < 2) {
    return null;
  }

  return (
    <div
      data-merak-canvas-batch="true"
      role="toolbar"
      aria-label="Multi-node actions"
      onPointerDown={(event) => event.stopPropagation()}
      {...stylex.props(styles.batchBar)}
    >
      <span {...stylex.props(styles.batchCount)}>{selectedCount} selected</span>
      <span aria-hidden="true" {...stylex.props(styles.pillDivider)} />
      <button type="button" onClick={onGroupSelected} {...stylex.props(styles.batchActionBtn)}>
        <BoxSelect size={13} />
        <span>Group</span>
      </button>
      <button type="button" onClick={onDuplicateSelected} {...stylex.props(styles.batchActionBtn)}>
        <CopyPlus size={13} />
        <span>Duplicate</span>
      </button>
      <button
        type="button"
        onClick={onDeleteSelected}
        {...stylex.props(styles.batchActionBtn, styles.batchDangerBtn)}
      >
        <Trash2 size={13} />
        <span>Delete</span>
      </button>
    </div>
  );
}

export function CanvasContextMenu({
  menu,
  selectedCount,
  onClose,
  onAddTextAt,
  onAddGroupAt,
  onOpenLinkDialog,
  onOpenEmbedDialog,
  onFitView,
  onDuplicateNode,
  onGroupSelected,
  onUngroupNode,
  onDeleteNode,
}: CanvasContextMenuProps) {
  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = () => onClose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(8, Math.min(menu.screenX, vw - 200));
  const top = Math.max(8, Math.min(menu.screenY, vh - 210));

  return (
    <div
      data-merak-canvas-context="true"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      {...stylex.props(styles.contextMenu)}
    >
      {menu.kind === "pane" ? (
        <>
          <button
            type="button"
            onClick={() => {
              onAddTextAt(menu.flowX, menu.flowY);
              onClose();
            }}
            {...stylex.props(styles.contextRow)}
          >
            <span {...stylex.props(styles.contextRowLeft)}>
              <span {...stylex.props(styles.contextIcon)}>
                <Type size={13} />
              </span>
              <span>Add Text Note</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onAddGroupAt(menu.flowX, menu.flowY);
              onClose();
            }}
            {...stylex.props(styles.contextRow)}
          >
            <span {...stylex.props(styles.contextRowLeft)}>
              <span {...stylex.props(styles.contextIcon)}>
                <BoxSelect size={13} />
              </span>
              <span>Add Group</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenLinkDialog();
              onClose();
            }}
            {...stylex.props(styles.contextRow)}
          >
            <span {...stylex.props(styles.contextRowLeft)}>
              <span {...stylex.props(styles.contextIcon)}>
                <Link2 size={13} />
              </span>
              <span>Add Link Card</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenEmbedDialog();
              onClose();
            }}
            {...stylex.props(styles.contextRow)}
          >
            <span {...stylex.props(styles.contextRowLeft)}>
              <span {...stylex.props(styles.contextIcon)}>
                <FileText size={13} />
              </span>
              <span>Embed Merak Node</span>
            </span>
          </button>
          <div {...stylex.props(styles.contextDivider)} />
          <button
            type="button"
            onClick={() => {
              onFitView();
              onClose();
            }}
            {...stylex.props(styles.contextRow)}
          >
            <span {...stylex.props(styles.contextRowLeft)}>
              <span {...stylex.props(styles.contextIcon)}>
                <LocateFixed size={13} />
              </span>
              <span>Fit View</span>
            </span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              onDuplicateNode(menu.nodeId);
              onClose();
            }}
            {...stylex.props(styles.contextRow)}
          >
            <span {...stylex.props(styles.contextRowLeft)}>
              <span {...stylex.props(styles.contextIcon)}>
                <CopyPlus size={13} />
              </span>
              <span>Duplicate</span>
            </span>
            <span {...stylex.props(styles.contextShortcut)}>⌘D</span>
          </button>
          {selectedCount >= 2 ? (
            <button
              type="button"
              onClick={() => {
                onGroupSelected();
                onClose();
              }}
              {...stylex.props(styles.contextRow)}
            >
              <span {...stylex.props(styles.contextRowLeft)}>
                <span {...stylex.props(styles.contextIcon)}>
                  <BoxSelect size={13} />
                </span>
                <span>Group Selected</span>
              </span>
              <span {...stylex.props(styles.contextShortcut)}>⌘G</span>
            </button>
          ) : null}
          {menu.isGroup ? (
            <button
              type="button"
              onClick={() => {
                onUngroupNode(menu.nodeId);
                onClose();
              }}
              {...stylex.props(styles.contextRow)}
            >
              <span {...stylex.props(styles.contextRowLeft)}>
                <span {...stylex.props(styles.contextIcon)}>
                  <Ungroup size={13} />
                </span>
                <span>Ungroup</span>
              </span>
              <span {...stylex.props(styles.contextShortcut)}>⌘⇧G</span>
            </button>
          ) : null}
          <div {...stylex.props(styles.contextDivider)} />
          <button
            type="button"
            onClick={() => {
              onDeleteNode(menu.nodeId);
              onClose();
            }}
            {...stylex.props(styles.contextRow, styles.contextDangerRow)}
          >
            <span {...stylex.props(styles.contextRowLeft)}>
              <Trash2 size={13} />
              <span>Delete</span>
            </span>
            <span {...stylex.props(styles.contextShortcut)}>Del</span>
          </button>
        </>
      )}
    </div>
  );
}
