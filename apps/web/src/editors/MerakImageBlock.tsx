import { defaultBlockSpecs } from "@blocknote/core";
import { FilePanelExtension } from "@blocknote/core/extensions";
import {
  createReactBlockSpec,
  type ReactCustomBlockRenderProps,
  useBlockNoteEditor,
  useExtension,
} from "@blocknote/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const baseImageBlockSpec = defaultBlockSpecs.image;
type BaseImageConfig = typeof baseImageBlockSpec.config;

const pendingUploadUrls = new Map<string, string>();
const uploadListeners = new Set<() => void>();

function notifyUploadListeners(): void {
  for (const listener of uploadListeners) {
    listener();
  }
}

export function markImageBlockUploading(blockId: string, previewUrl: string): void {
  if (!blockId) return;
  pendingUploadUrls.set(blockId, previewUrl);
  notifyUploadListeners();
}

export function clearImageBlockUploading(blockId: string): void {
  if (!blockId || !pendingUploadUrls.has(blockId)) return;
  pendingUploadUrls.delete(blockId);
  notifyUploadListeners();
}

function subscribeUploadState(listener: () => void): () => void {
  uploadListeners.add(listener);
  return () => {
    uploadListeners.delete(listener);
  };
}

function useImageBlockUploading(blockId: string): boolean {
  return useSyncExternalStore(
    subscribeUploadState,
    () => pendingUploadUrls.has(blockId),
    () => false,
  );
}

type ImageAlignment = "left" | "center" | "right";

function normalizeAlignment(value: unknown): ImageAlignment {
  if (value === "center" || value === "right" || value === "left") {
    return value;
  }
  return "left";
}

function nextAlignment(current: ImageAlignment): ImageAlignment {
  if (current === "left") return "center";
  if (current === "center") return "right";
  return "left";
}

function getAlignmentIcon(alignment: ImageAlignment) {
  if (alignment === "center") return <AlignCenter size={14} />;
  if (alignment === "right") return <AlignRight size={14} />;
  return <AlignLeft size={14} />;
}

interface ImageLightboxProps {
  open: boolean;
  url: string;
  alt: string;
  caption: string;
  filename: string;
  onClose: () => void;
  onDownload: () => void;
}

function MerakImageLightbox({
  open,
  url,
  alt,
  caption,
  filename,
  onClose,
  onDownload,
}: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Mandatory Safari/legacy fallback when `closedBy` is not supported natively.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || ("closedBy" in HTMLDialogElement.prototype)) return;

    const handleClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) {
        dialog.close();
      }
    };

    dialog.addEventListener("click", handleClick);
    return () => dialog.removeEventListener("click", handleClick);
  }, []);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as Record<string, unknown>)}
      aria-label={caption || alt || filename || "Image preview"}
      className="merak-image-lightbox"
      onClose={onClose}
    >
      <div className="merak-image-lightbox-panel">
        <div className="merak-image-lightbox-actions">
          <button
            type="button"
            className="merak-image-lightbox-btn"
            aria-label="Download image"
            title="Download"
            onClick={onDownload}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="merak-image-lightbox-btn"
            aria-label="Close preview"
            title="Close (Esc)"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={16} />
          </button>
        </div>

        <img src={url} alt={alt} className="merak-image-lightbox-img" />

        {caption ? <p className="merak-image-lightbox-caption">{caption}</p> : null}
      </div>
    </dialog>
  );
}

function MerakImageBlockView({
  block,
}: ReactCustomBlockRenderProps<BaseImageConfig>) {
  const editor = useBlockNoteEditor();
  const filePanel = useExtension(FilePanelExtension);
  const isUploading = useImageBlockUploading(block.id);

  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(block.props.caption ?? "");
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<{
    side: "left" | "right";
    startX: number;
    startWidth: number;
    maxWidth: number;
    alignment: ImageAlignment;
  } | null>(null);

  const url = block.props.url ?? "";
  const caption = block.props.caption ?? "";
  const name = block.props.name ?? "";
  const alignment = normalizeAlignment(block.props.textAlignment);
  const editable = editor.isEditable;

  useEffect(() => {
    setCaptionDraft(caption);
  }, [caption]);

  const commitCaption = useCallback(
    (nextValue: string) => {
      if (!editable) return;
      const normalized = nextValue.trimEnd();
      if (normalized !== caption) {
        editor.updateBlock(block.id, {
          props: { caption: normalized } as Record<string, unknown>,
        } as Parameters<typeof editor.updateBlock>[1]);
      }
      if (normalized.length === 0) {
        setCaptionOpen(false);
      }
    },
    [block.id, caption, editable, editor],
  );

  const handleOpenCaption = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editable) return;
      setCaptionOpen(true);
      window.requestAnimationFrame(() => {
        captionInputRef.current?.focus();
      });
    },
    [editable],
  );

  const handleCycleAlignment = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editable) return;
      const targetAlign = nextAlignment(alignment);
      editor.updateBlock(block.id, {
        props: { textAlignment: targetAlign } as Record<string, unknown>,
      } as Parameters<typeof editor.updateBlock>[1]);
    },
    [alignment, block.id, editable, editor],
  );

  const handleDownload = useCallback(() => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = name || "image";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [name, url]);

  const handleReplace = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editable) return;
      filePanel.showMenu(block.id);
    },
    [block.id, editable, filePanel],
  );

  const handleDelete = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editable) return;
      editor.removeBlocks([block.id]);
    },
    [block.id, editable, editor],
  );

  const handleResizePointerDown = useCallback(
    (side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) => {
      if (!editable || isUploading || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const frame = frameRef.current;
      const root = rootRef.current;
      if (!frame || !root) return;

      const startWidth = frame.getBoundingClientRect().width;
      const maxWidth = Math.max(240, root.getBoundingClientRect().width);
      dragStateRef.current = {
        side,
        startX: event.clientX,
        startWidth,
        maxWidth,
        alignment,
      };
      setDragWidth(startWidth);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [alignment, editable, isUploading],
  );

  const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state) return;
    const rawDelta =
      state.side === "right" ? event.clientX - state.startX : state.startX - event.clientX;
    const scaledDelta = state.alignment === "center" ? rawDelta * 2 : rawDelta;
    const nextWidth = Math.max(120, Math.min(state.maxWidth, state.startWidth + scaledDelta));
    setDragWidth(nextWidth);
  }, []);

  const finishResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state) return;
      const rawDelta =
        state.side === "right" ? event.clientX - state.startX : state.startX - event.clientX;
      const scaledDelta = state.alignment === "center" ? rawDelta * 2 : rawDelta;
      const finalWidth = Math.round(
        Math.max(120, Math.min(state.maxWidth, state.startWidth + scaledDelta)),
      );
      dragStateRef.current = null;
      setDragWidth(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (Math.abs(finalWidth - state.startWidth) >= 2) {
        editor.updateBlock(block.id, {
          props: { previewWidth: finalWidth } as Record<string, unknown>,
        } as Parameters<typeof editor.updateBlock>[1]);
      }
    },
    [block.id, editor],
  );

  if (!url) {
    return (
      <div
        ref={rootRef}
        className="merak-image-block-root"
        data-merak-image-block="true"
        data-align={alignment}
      >
        <button
          type="button"
          className="bn-add-file-button merak-image-placeholder"
          disabled={!editable}
          onClick={() => {
            if (editable) filePanel.showMenu(block.id);
          }}
        >
          <span className="bn-add-file-button-icon">
            <ImageIcon size={18} />
          </span>
          <span className="bn-add-file-button-text">Add an image</span>
        </button>
      </div>
    );
  }

  const effectiveWidth = dragWidth ?? block.props.previewWidth;
  const frameStyle =
    typeof effectiveWidth === "number" && Number.isFinite(effectiveWidth) && effectiveWidth > 0
      ? { width: `${Math.round(effectiveWidth)}px` }
      : undefined;

  const showCaptionInput = captionOpen || caption.length > 0;

  return (
    <div
      ref={rootRef}
      className="merak-image-block-root"
      data-merak-image-block="true"
      data-align={alignment}
    >
      <div
        ref={frameRef}
        className="merak-image-frame"
        data-resizing={dragWidth !== null ? "true" : undefined}
        style={frameStyle}
      >
        <img
          src={url}
          alt={caption || name || "Document image"}
          className="merak-image-el"
          data-uploading={isUploading ? "true" : undefined}
          draggable={false}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isUploading) setLightboxOpen(true);
          }}
        />

        {!isUploading ? (
          <div className="merak-image-toolbar" role="toolbar" aria-label="Image actions">
            {editable ? (
              <>
                <button
                  type="button"
                  className="merak-image-toolbar-btn"
                  aria-label="Add caption"
                  title="Caption"
                  onClick={handleOpenCaption}
                >
                  <Captions size={14} />
                </button>
                <button
                  type="button"
                  className="merak-image-toolbar-btn"
                  aria-label={`Alignment: ${alignment}`}
                  title={`Align (${alignment})`}
                  onClick={handleCycleAlignment}
                >
                  {getAlignmentIcon(alignment)}
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="merak-image-toolbar-btn"
              aria-label="View fullscreen"
              title="Fullscreen"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setLightboxOpen(true);
              }}
            >
              <Maximize2 size={14} />
            </button>

            <button
              type="button"
              className="merak-image-toolbar-btn"
              aria-label="Download image"
              title="Download"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDownload();
              }}
            >
              <Download size={14} />
            </button>

            {editable ? (
              <>
                <button
                  type="button"
                  className="merak-image-toolbar-btn"
                  aria-label="Replace image"
                  title="Replace"
                  onClick={handleReplace}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  type="button"
                  className="merak-image-toolbar-btn"
                  data-danger="true"
                  aria-label="Delete image"
                  title="Delete"
                  onClick={handleDelete}
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <div className="merak-image-uploading-pill" aria-live="polite">
            <Loader2 size={13} className="merak-spin" />
            <span>Uploading...</span>
          </div>
        )}

        {editable && !isUploading ? (
          <>
            <div
              className="merak-image-resize-handle"
              data-side="left"
              onPointerDown={(e) => handleResizePointerDown("left", e)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
            />
            <div
              className="merak-image-resize-handle"
              data-side="right"
              onPointerDown={(e) => handleResizePointerDown("right", e)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
            />
          </>
        ) : null}

        {dragWidth !== null ? (
          <div className="merak-image-width-pill">{Math.round(dragWidth)}px</div>
        ) : null}
      </div>

      {showCaptionInput ? (
        <input
          ref={captionInputRef}
          type="text"
          className="merak-image-caption-input"
          style={frameStyle}
          placeholder="Write a caption..."
          readOnly={!editable}
          value={captionDraft}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setCaptionDraft(event.target.value)}
          onBlur={() => commitCaption(captionDraft)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              commitCaption(captionDraft);
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              commitCaption(captionDraft);
              event.currentTarget.blur();
            }
          }}
        />
      ) : null}

      <MerakImageLightbox
        open={lightboxOpen}
        url={url}
        alt={caption || name || "Document image"}
        caption={caption}
        filename={name || "image"}
        onClose={() => setLightboxOpen(false)}
        onDownload={handleDownload}
      />
    </div>
  );
}

const createMerakReactImageBlockSpec = createReactBlockSpec(
  baseImageBlockSpec.config,
  {
    meta: baseImageBlockSpec.implementation.meta,
    parse: baseImageBlockSpec.implementation.parse,
    render: MerakImageBlockView,
  },
  baseImageBlockSpec.extensions,
);

export function createMerakImageBlockSpec() {
  const spec = createMerakReactImageBlockSpec();
  // Preserve BlockNote's native figure/img HTML serialization so Markdown round-trips losslessly.
  spec.implementation.toExternalHTML = baseImageBlockSpec.implementation.toExternalHTML;
  return spec;
}
