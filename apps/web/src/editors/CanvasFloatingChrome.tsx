import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@merak/ui";
import { colors, font, radius, shadow } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  BoxSelect,
  Eraser,
  FileText,
  Grid,
  Hand,
  HelpCircle,
  ImagePlus,
  Link2,
  LocateFixed,
  Map,
  Maximize2,
  MousePointer2,
  Palette,
  Redo2,
  Square,
  Type,
  Undo2,
  X,
} from "lucide-react";
import type { CanvasGridMode } from "./canvasOps.js";

export type CanvasInteractionMode = "select" | "pan";

export interface CanvasFloatingChromeProps {
  readOnly: boolean;
  interactionMode: CanvasInteractionMode;
  spacePanning: boolean;
  onInteractionModeChange: (mode: CanvasInteractionMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFitView: () => void;
  onAddTextNote: () => void;
  onAddGroup: () => void;
  onOpenEmbedDialog: () => void;
  onOpenLinkDialog: () => void;
  onTriggerUploadImage: () => void;
  uploading: boolean;
  gridMode: CanvasGridMode;
  onGridModeChange: (mode: CanvasGridMode) => void;
  nodeCount: number;
  edgeCount: number;
  onClearCanvas: () => void;
  minimapOpen: boolean;
  onToggleMinimap: () => void;
  zoom: number;
  onZoomChange: (nextZoom: number) => void;
  shortcutsOpen: boolean;
  onShortcutsOpenChange: (open: boolean) => void;
}

const SHORTCUT_ITEMS: readonly { keys: readonly string[]; description: string }[] = [
  { keys: ["V"], description: "Select & marquee mode" },
  { keys: ["H"], description: "Hand pan mode" },
  { keys: ["Space", "Drag"], description: "Hold to temporarily pan canvas" },
  { keys: ["Scroll"], description: "Zoom viewport" },
  { keys: ["Cmd / Ctrl", "A"], description: "Select all nodes" },
  { keys: ["Cmd / Ctrl", "D"], description: "Duplicate selected nodes" },
  { keys: ["Cmd / Ctrl", "G"], description: "Group selected nodes" },
  { keys: ["Cmd / Ctrl", "Shift", "G"], description: "Ungroup selected group" },
  { keys: ["Cmd / Ctrl", "Z"], description: "Undo" },
  { keys: ["Cmd / Ctrl", "Shift", "Z"], description: "Redo" },
  { keys: ["Cmd / Ctrl", "V"], description: "Paste text, URL, or image card" },
  { keys: ["Double-click"], description: "Edit note text or activate card preview" },
  { keys: ["Delete / Backspace"], description: "Delete selected nodes or edges" },
  { keys: ["Esc"], description: "Clear selection & close overlays" },
];

const styles = stylex.create({
  bottomCenterDock: {
    position: "absolute",
    bottom: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 45,
    display: "flex",
    alignItems: "center",
    gap: "2px",
    height: "48px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "8px",
    paddingRight: "8px",
    borderRadius: "14px",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.lg,
    backdropFilter: "blur(10px)",
    maxWidth: "calc(100% - 32px)",
    overflowX: "auto",
  },
  dockButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "34px",
    height: "34px",
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
    flexShrink: 0,
    transitionProperty: "background-color, color",
    transitionDuration: "120ms",
  },
  dockButtonActive: {
    backgroundColor: colors.bgActive,
    color: colors.text,
  },
  dockButtonDanger: {
    color: {
      default: colors.danger,
      ":hover": colors.danger,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": "rgba(225, 98, 89, 0.14)",
    },
  },
  dockButtonDisabled: {
    opacity: 0.36,
    cursor: "not-allowed",
  },
  dockDivider: {
    width: "1px",
    height: "20px",
    marginLeft: "4px",
    marginRight: "4px",
    backgroundColor: colors.borderSubtle,
    flexShrink: 0,
  },
  bottomLeftBar: {
    position: "absolute",
    bottom: "16px",
    left: "16px",
    zIndex: 45,
    display: "flex",
    alignItems: "center",
    gap: "4px",
    height: "40px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "6px",
    paddingRight: "8px",
    borderRadius: "12px",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    boxShadow: shadow.lg,
    backdropFilter: "blur(10px)",
  },
  viewportButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
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
    flexShrink: 0,
  },
  zoomSlider: {
    width: "84px",
    height: "4px",
    cursor: "pointer",
    accentColor: colors.accent,
  },
  zoomPercent: {
    minWidth: "40px",
    textAlign: "right",
    fontSize: "12px",
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
    userSelect: "none",
  },
  appearancePanel: {
    width: "236px",
    maxWidth: "236px",
    gap: 0,
    rowGap: 0,
    paddingTop: "8px",
    paddingBottom: "8px",
    paddingLeft: "8px",
    paddingRight: "8px",
    backgroundColor: colors.bgElevated,
    borderWidth: 0,
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
  },
  panelTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: colors.text,
    paddingBottom: "6px",
  },
  panelSectionLabel: {
    fontSize: "11px",
    fontWeight: 500,
    color: colors.textMuted,
    paddingBottom: "4px",
  },
  gridOptionsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "4px",
    paddingBottom: "8px",
  },
  gridOptionBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    height: "28px",
    paddingLeft: "6px",
    paddingRight: "6px",
    borderRadius: "6px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: {
      default: colors.bgSubtle,
      ":hover": colors.bgHover,
    },
    color: colors.textMuted,
    fontFamily: font.sans,
    fontSize: "12px",
    cursor: "pointer",
  },
  gridOptionActive: {
    backgroundColor: colors.bgActive,
    borderColor: colors.accent,
    color: colors.text,
  },
  panelDivider: {
    height: "1px",
    marginTop: "2px",
    marginBottom: "6px",
    marginLeft: "-8px",
    marginRight: "-8px",
    backgroundColor: colors.borderSubtle,
  },
  panelFooter: {
    fontSize: "11px",
    color: colors.textMuted,
  },
  dialogBackdrop: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    zIndex: 300,
  },
  dialogContent: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(460px, calc(100vw - 32px))",
    maxHeight: "min(560px, calc(100vh - 48px))",
    overflowY: "auto",
    backgroundColor: colors.bgElevated,
    color: colors.text,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: "12px",
    boxShadow: shadow.lg,
    paddingTop: "16px",
    paddingBottom: "16px",
    paddingLeft: "18px",
    paddingRight: "18px",
    zIndex: 310,
  },
  dialogHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: "8px",
  },
  dialogTitle: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: "15px",
    fontWeight: 600,
    color: colors.text,
  },
  dialogDesc: {
    marginTop: 0,
    marginBottom: "10px",
    fontSize: "12px",
    color: colors.textMuted,
  },
  closeIconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.textMuted,
    cursor: "pointer",
  },
  shortcutList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  shortcutRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    paddingTop: "4px",
    paddingBottom: "4px",
  },
  keyCluster: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    flexShrink: 0,
  },
  keyCap: {
    display: "inline-flex",
    alignItems: "center",
    height: "22px",
    paddingLeft: "7px",
    paddingRight: "7px",
    borderRadius: "5px",
    backgroundColor: colors.bgSubtle,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    color: colors.text,
    fontFamily: font.mono,
    fontSize: "11px",
    fontWeight: 500,
  },
  shortcutDesc: {
    fontSize: "12.5px",
    color: colors.textMuted,
    textAlign: "right",
  },
});

export function CanvasFloatingChrome({
  readOnly,
  interactionMode,
  spacePanning,
  onInteractionModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFitView,
  onAddTextNote,
  onAddGroup,
  onOpenEmbedDialog,
  onOpenLinkDialog,
  onTriggerUploadImage,
  uploading,
  gridMode,
  onGridModeChange,
  nodeCount,
  edgeCount,
  onClearCanvas,
  minimapOpen,
  onToggleMinimap,
  zoom,
  onZoomChange,
  shortcutsOpen,
  onShortcutsOpenChange,
}: CanvasFloatingChromeProps) {
  const effectivePan = spacePanning || interactionMode === "pan";
  const zoomPct = Math.round(Math.min(250, Math.max(15, zoom * 100)));

  return (
    <>
      <div
        data-merak-canvas-dock="true"
        role="toolbar"
        aria-label="Canvas floating dock"
        {...stylex.props(styles.bottomCenterDock)}
      >
        <button
          type="button"
          aria-label="Select mode"
          title="Select & Marquee (V)"
          aria-pressed={!effectivePan}
          onClick={() => onInteractionModeChange("select")}
          {...stylex.props(styles.dockButton, !effectivePan && styles.dockButtonActive)}
        >
          <MousePointer2 size={15} />
        </button>

        <button
          type="button"
          aria-label="Pan mode"
          title="Hand Pan (H or hold Space)"
          aria-pressed={effectivePan}
          onClick={() => onInteractionModeChange("pan")}
          {...stylex.props(styles.dockButton, effectivePan && styles.dockButtonActive)}
        >
          <Hand size={15} />
        </button>

        {!readOnly ? (
          <>
            <button
              type="button"
              aria-label="Undo"
              title="Undo (⌘Z)"
              disabled={!canUndo}
              onClick={onUndo}
              {...stylex.props(styles.dockButton, !canUndo && styles.dockButtonDisabled)}
            >
              <Undo2 size={15} />
            </button>

            <button
              type="button"
              aria-label="Redo"
              title="Redo (⌘⇧Z)"
              disabled={!canRedo}
              onClick={onRedo}
              {...stylex.props(styles.dockButton, !canRedo && styles.dockButtonDisabled)}
            >
              <Redo2 size={15} />
            </button>
          </>
        ) : null}

        <button
          type="button"
          aria-label="Fit view"
          title="Fit canvas to view"
          onClick={onFitView}
          {...stylex.props(styles.dockButton)}
        >
          <LocateFixed size={15} />
        </button>

        {!readOnly ? (
          <>
            <span aria-hidden="true" {...stylex.props(styles.dockDivider)} />

            <button
              type="button"
              aria-label="Add text note"
              title="Add Text Note"
              onClick={onAddTextNote}
              {...stylex.props(styles.dockButton)}
            >
              <Type size={15} />
            </button>

            <button
              type="button"
              aria-label="Add group"
              title="Add Group"
              onClick={onAddGroup}
              {...stylex.props(styles.dockButton)}
            >
              <BoxSelect size={15} />
            </button>

            <button
              type="button"
              aria-label="Embed Merak node"
              title="Embed Merak Node"
              onClick={onOpenEmbedDialog}
              {...stylex.props(styles.dockButton)}
            >
              <FileText size={15} />
            </button>

            <button
              type="button"
              aria-label="Add link card"
              title="Add Link Card"
              onClick={onOpenLinkDialog}
              {...stylex.props(styles.dockButton)}
            >
              <Link2 size={15} />
            </button>

            <button
              type="button"
              aria-label="Upload image"
              title={uploading ? "Uploading image..." : "Upload Image"}
              disabled={uploading}
              onClick={onTriggerUploadImage}
              {...stylex.props(styles.dockButton, uploading && styles.dockButtonDisabled)}
            >
              <ImagePlus size={15} />
            </button>
          </>
        ) : null}

        <span aria-hidden="true" {...stylex.props(styles.dockDivider)} />

        <Popover>
          <PopoverTrigger
            aria-label="Canvas appearance"
            title="Canvas appearance"
            data-merak-canvas-appearance-trigger="true"
            {...stylex.props(styles.dockButton)}
          >
            <Palette size={15} />
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={10}
            data-merak-canvas-appearance="true"
            {...stylex.props(styles.appearancePanel)}
          >
            <div {...stylex.props(styles.panelTitle)}>Canvas appearance</div>
            <div {...stylex.props(styles.panelSectionLabel)}>Grid style</div>
            <div {...stylex.props(styles.gridOptionsRow)}>
              <button
                type="button"
                aria-pressed={gridMode === "dots"}
                onClick={() => onGridModeChange("dots")}
                {...stylex.props(
                  styles.gridOptionBtn,
                  gridMode === "dots" && styles.gridOptionActive,
                )}
              >
                <span>Dots</span>
              </button>
              <button
                type="button"
                aria-pressed={gridMode === "lines"}
                onClick={() => onGridModeChange("lines")}
                {...stylex.props(
                  styles.gridOptionBtn,
                  gridMode === "lines" && styles.gridOptionActive,
                )}
              >
                <Grid size={12} />
                <span>Lines</span>
              </button>
              <button
                type="button"
                aria-pressed={gridMode === "blank"}
                onClick={() => onGridModeChange("blank")}
                {...stylex.props(
                  styles.gridOptionBtn,
                  gridMode === "blank" && styles.gridOptionActive,
                )}
              >
                <Square size={12} />
                <span>Blank</span>
              </button>
            </div>

            <div {...stylex.props(styles.panelDivider)} />
            <div {...stylex.props(styles.panelFooter)}>
              {nodeCount} {nodeCount === 1 ? "node" : "nodes"} · {edgeCount}{" "}
              {edgeCount === 1 ? "edge" : "edges"}
            </div>
          </PopoverContent>
        </Popover>

        {!readOnly && nodeCount > 0 ? (
          <>
            <span aria-hidden="true" {...stylex.props(styles.dockDivider)} />
            <button
              type="button"
              aria-label="Clear canvas"
              title="Clear canvas"
              onClick={onClearCanvas}
              {...stylex.props(styles.dockButton, styles.dockButtonDanger)}
            >
              <Eraser size={15} />
            </button>
          </>
        ) : null}
      </div>

      <div
        data-merak-canvas-viewport="true"
        role="group"
        aria-label="Canvas viewport controls"
        {...stylex.props(styles.bottomLeftBar)}
      >
        <button
          type="button"
          aria-label="Toggle minimap"
          title={minimapOpen ? "Hide minimap" : "Show minimap"}
          aria-pressed={minimapOpen}
          onClick={onToggleMinimap}
          {...stylex.props(styles.viewportButton, minimapOpen && styles.dockButtonActive)}
        >
          <Map size={14} />
        </button>

        <button
          type="button"
          aria-label="Reset view"
          title="Fit & center canvas"
          onClick={onFitView}
          {...stylex.props(styles.viewportButton)}
        >
          <Maximize2 size={14} />
        </button>

        <input
          type="range"
          min={15}
          max={250}
          step={5}
          value={zoomPct}
          aria-label="Canvas zoom level"
          onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
          {...stylex.props(styles.zoomSlider)}
        />

        <span {...stylex.props(styles.zoomPercent)}>{zoomPct}%</span>

        <button
          type="button"
          aria-label="Keyboard shortcuts"
          title="Canvas shortcuts"
          onClick={() => onShortcutsOpenChange(true)}
          {...stylex.props(styles.viewportButton)}
        >
          <HelpCircle size={14} />
        </button>
      </div>

      <Dialog open={shortcutsOpen} onOpenChange={onShortcutsOpenChange}>
        <DialogBackdrop {...stylex.props(styles.dialogBackdrop)} />
        <DialogContent data-merak-canvas-shortcuts="true" {...stylex.props(styles.dialogContent)}>
          <div {...stylex.props(styles.dialogHeader)}>
            <DialogTitle {...stylex.props(styles.dialogTitle)}>Canvas shortcuts</DialogTitle>
            <DialogClose
              aria-label="Close shortcuts"
              {...stylex.props(styles.closeIconBtn)}
            >
              <X size={15} />
            </DialogClose>
          </div>
          <DialogDescription {...stylex.props(styles.dialogDesc)}>
            Navigation, grouping, clipboard, and editing shortcuts for Infinite Canvas.
          </DialogDescription>
          <div {...stylex.props(styles.shortcutList)}>
            {SHORTCUT_ITEMS.map((item) => (
              <div key={item.description} {...stylex.props(styles.shortcutRow)}>
                <div {...stylex.props(styles.keyCluster)}>
                  {item.keys.map((key) => (
                    <kbd key={key} {...stylex.props(styles.keyCap)}>
                      {key}
                    </kbd>
                  ))}
                </div>
                <span {...stylex.props(styles.shortcutDesc)}>{item.description}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
