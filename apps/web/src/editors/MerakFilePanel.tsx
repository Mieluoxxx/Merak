import { filenameFromURL } from "@blocknote/core";
import { FilePanelExtension } from "@blocknote/core/extensions";
import { type FilePanelProps, useBlockNoteEditor, useExtension } from "@blocknote/react";
import { colors, font, radius, shadow } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link2, Upload } from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";

type FilePanelTab = "upload" | "embed";

const MEDIA_LABEL_MAP: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "file",
};

const styles = stylex.create({
  card: {
    width: "340px",
    maxWidth: "calc(100vw - 24px)",
    backgroundColor: colors.bgElevated,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: "10px",
    boxShadow: shadow.lg,
    overflow: "hidden",
    fontFamily: font.sans,
    color: colors.text,
  },
  tabBar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    paddingTop: "4px",
    paddingBottom: 0,
    paddingLeft: "12px",
    paddingRight: "12px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
  },
  tabButton: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height: "34px",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: "2px",
    paddingRight: "2px",
    borderWidth: 0,
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    backgroundColor: "transparent",
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
    },
    fontFamily: font.sans,
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
  },
  tabButtonActive: {
    color: colors.text,
    borderBottomColor: colors.text,
  },
  body: {
    paddingTop: "12px",
    paddingBottom: "12px",
    paddingLeft: "12px",
    paddingRight: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  hiddenInput: {
    display: "none",
  },
  dropzone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    width: "100%",
    minHeight: "88px",
    paddingTop: "14px",
    paddingBottom: "14px",
    paddingLeft: "12px",
    paddingRight: "12px",
    borderRadius: radius.sm,
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: {
      default: colors.border,
      ":hover": colors.textMuted,
    },
    backgroundColor: {
      default: colors.bgSubtle,
      ":hover": colors.bgHover,
    },
    color: colors.text,
    cursor: "pointer",
    transitionProperty: "background-color, border-color",
    transitionDuration: "120ms",
  },
  dropzoneActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgHover,
  },
  dropzoneTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "13px",
    fontWeight: 500,
    color: colors.text,
  },
  dropzoneHint: {
    fontSize: "11.5px",
    color: colors.textMuted,
  },
  errorText: {
    fontSize: "12px",
    color: colors.danger,
    textAlign: "center",
  },
  embedForm: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  urlInput: {
    width: "100%",
    height: "32px",
    paddingLeft: "10px",
    paddingRight: "10px",
    borderRadius: "6px",
    backgroundColor: colors.bgSubtle,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: colors.border,
      ":focus": colors.accent,
    },
    color: colors.text,
    fontFamily: font.sans,
    fontSize: "13px",
    outlineStyle: "none",
  },
  submitButton: {
    width: "100%",
    height: "32px",
    borderWidth: 0,
    borderRadius: "6px",
    backgroundColor: colors.accent,
    color: "#ffffff",
    fontFamily: font.sans,
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
  },
  submitButtonDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
});

export function MerakFilePanel({ blockId }: FilePanelProps) {
  const editor = useBlockNoteEditor();
  const filePanel = useExtension(FilePanelExtension);
  const block = editor.getBlock(blockId);

  const [tab, setTab] = useState<FilePanelTab>("upload");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!editor.uploadFile) return;
      setUploading(true);
      setUploadFailed(false);
      try {
        let updateData = await editor.uploadFile(file, blockId);
        if (!editor.getBlock(blockId)) return;
        if (typeof updateData === "string") {
          updateData = {
            props: {
              name: file.name,
              url: updateData,
            },
          };
        }
        editor.updateBlock(blockId, updateData as Parameters<typeof editor.updateBlock>[1]);
        filePanel.closeMenu();
      } catch {
        setUploadFailed(true);
      } finally {
        setUploading(false);
      }
    },
    [blockId, editor, filePanel],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handleEmbedSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = embedUrl.trim();
      if (!trimmed || !editor.getBlock(blockId)) return;
      editor.updateBlock(blockId, {
        props: {
          name: filenameFromURL(trimmed),
          url: trimmed,
        } as Record<string, unknown>,
      } as Parameters<typeof editor.updateBlock>[1]);
      filePanel.closeMenu();
    },
    [blockId, editor, embedUrl, filePanel],
  );

  if (!block) {
    return null;
  }

  const spec = editor.schema.blockSpecs[block.type];
  const acceptTypes = spec?.implementation.meta.fileBlockAccept;
  const accept = acceptTypes?.length ? acceptTypes.join(",") : "*/*";
  const mediaLabel = MEDIA_LABEL_MAP[block.type] ?? "file";
  const hasUrl = embedUrl.trim().length > 0;

  return (
    <div data-merak-file-panel="true" {...stylex.props(styles.card)}>
      <div role="tablist" {...stylex.props(styles.tabBar)}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upload"}
          onClick={() => setTab("upload")}
          {...stylex.props(styles.tabButton, tab === "upload" && styles.tabButtonActive)}
        >
          <Upload size={13} />
          <span>Upload</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "embed"}
          onClick={() => setTab("embed")}
          {...stylex.props(styles.tabButton, tab === "embed" && styles.tabButtonActive)}
        >
          <Link2 size={13} />
          <span>Embed link</span>
        </button>
      </div>

      <div {...stylex.props(styles.body)}>
        {tab === "upload" ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              onChange={handleFileChange}
              {...stylex.props(styles.hiddenInput)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              {...stylex.props(styles.dropzone, dragOver && styles.dropzoneActive)}
            >
              <span {...stylex.props(styles.dropzoneTitle)}>
                <Upload size={14} />
                <span>{uploading ? "Uploading..." : `Upload ${mediaLabel}`}</span>
              </span>
              <span {...stylex.props(styles.dropzoneHint)}>
                Click to browse or drag &amp; drop
              </span>
            </button>
            {uploadFailed ? (
              <div {...stylex.props(styles.errorText)}>Upload failed. Please try again.</div>
            ) : null}
          </>
        ) : (
          <form onSubmit={handleEmbedSubmit} {...stylex.props(styles.embedForm)}>
            <input
              type="url"
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
              placeholder={`Paste the ${mediaLabel} link...`}
              autoFocus
              {...stylex.props(styles.urlInput)}
            />
            <button
              type="submit"
              disabled={!hasUrl}
              {...stylex.props(
                styles.submitButton,
                !hasUrl && styles.submitButtonDisabled,
              )}
            >
              {`Embed ${mediaLabel}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
