import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { AssetEditorProps } from "@merak/shared";
import { Badge, Button, Inline, Toolbar } from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { PenTool, Save, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./editors.css";
import {
  countActiveExcalidrawElements,
  parseExcalidrawContent,
  serializeExcalidrawDocument,
} from "./excalidrawHelpers.js";
import { formatMediaUrl, useGlobalSaveShortcut } from "./shared.js";

const DEBOUNCE_MS = 300;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: "480px",
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.md,
    backgroundColor: colors.bgSubtle,
    borderBottom: `1px solid ${colors.border}`,
  },
  titleText: {
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
    maxWidth: "240px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  canvasWrap: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    width: "100%",
  },
});

async function dataUrlToFile(dataUrl: string, fileId: string, mimeType?: string): Promise<File | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const type = mimeType || blob.type || "image/png";
    const ext = type.split("/")[1]?.split("+")[0] || "png";
    return new File([blob], `excalidraw-${fileId}.${ext}`, { type });
  } catch {
    return null;
  }
}

export function ExcalidrawEditor({
  node,
  readOnly = false,
  theme,
  onChange,
  onSave,
  onUploadMedia,
}: AssetEditorProps) {
  const initialDoc = useMemo(() => parseExcalidrawContent(node.content), [node.id]);

  const [elementCount, setElementCount] = useState<number>(() =>
    countActiveExcalidrawElements(initialDoc),
  );
  const [uploadingCount, setUploadingCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const onUploadMediaRef = useRef(onUploadMedia);
  onUploadMediaRef.current = onUploadMedia;

  const uploadedMediaMapRef = useRef<Record<string, string>>({});
  const uploadingFileIdsRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSceneRef = useRef<{
    elements: readonly Record<string, unknown>[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
  }>({
    elements: initialDoc.elements,
    appState: initialDoc.appState,
    files: initialDoc.files,
  });
  const lastSerializedRef = useRef<string>(JSON.stringify(initialDoc, null, 2));

  // Reset tracking state when node.id changes.
  useEffect(() => {
    const nextDoc = parseExcalidrawContent(node.content);
    setElementCount(countActiveExcalidrawElements(nextDoc));

    const existingMap: Record<string, string> = {};
    for (const [fileId, rawEntry] of Object.entries(nextDoc.files)) {
      if (rawEntry && typeof rawEntry === "object") {
        const entry = rawEntry as Record<string, unknown>;
        const mediaUrl =
          typeof entry.mediaUrl === "string"
            ? entry.mediaUrl
            : typeof entry.dataURL === "string" && entry.dataURL.startsWith("/api/media/")
              ? entry.dataURL
              : undefined;
        if (mediaUrl) {
          existingMap[fileId] = mediaUrl;
        }
      }
    }

    uploadedMediaMapRef.current = existingMap;
    uploadingFileIdsRef.current = new Set();
    latestSceneRef.current = {
      elements: nextDoc.elements,
      appState: nextDoc.appState,
      files: nextDoc.files,
    };
    lastSerializedRef.current = JSON.stringify(nextDoc, null, 2);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [node.id]);

  const flushSerialization = useCallback((emitChange: boolean): string => {
    const scene = latestSceneRef.current;
    const serialized = serializeExcalidrawDocument({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      uploadedMediaMap: uploadedMediaMapRef.current,
    });

    if (emitChange && serialized !== lastSerializedRef.current) {
      lastSerializedRef.current = serialized;
      onChangeRef.current(serialized);
    }
    return serialized;
  }, []);

  const scheduleSerialize = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      flushSerialization(true);
    }, DEBOUNCE_MS);
  }, [flushSerialization]);

  const handleSave = useCallback(async () => {
    if (!onSaveRef.current || readOnly) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setSaving(true);
    try {
      const serialized = flushSerialization(true);
      await onSaveRef.current(serialized);
    } finally {
      setSaving(false);
    }
  }, [flushSerialization, readOnly]);

  useGlobalSaveShortcut(Boolean(onSave) && !readOnly, handleSave);

  const handleGenerateIdForFile = useCallback(async (file: File): Promise<string> => {
    setUploadingCount((c) => c + 1);
    try {
      const media = await onUploadMediaRef.current(file);
      const mediaUrl = formatMediaUrl(media);
      uploadedMediaMapRef.current[media.id] = mediaUrl;
      return media.id;
    } finally {
      setUploadingCount((c) => Math.max(0, c - 1));
    }
  }, []);

  const uploadPendingBase64Files = useCallback(
    (files: Record<string, unknown>) => {
      if (readOnly) return;
      for (const [fileId, rawEntry] of Object.entries(files)) {
        if (uploadedMediaMapRef.current[fileId] || uploadingFileIdsRef.current.has(fileId)) {
          continue;
        }
        if (!rawEntry || typeof rawEntry !== "object") continue;
        const entry = rawEntry as Record<string, unknown>;
        const dataURL = typeof entry.dataURL === "string" ? entry.dataURL : "";
        if (!dataURL.startsWith("data:")) continue;

        uploadingFileIdsRef.current.add(fileId);
        setUploadingCount((c) => c + 1);
        const mimeType = typeof entry.mimeType === "string" ? entry.mimeType : undefined;

        void dataUrlToFile(dataURL, fileId, mimeType)
          .then(async (file) => {
            if (!file) return;
            const media = await onUploadMediaRef.current(file);
            uploadedMediaMapRef.current[fileId] = formatMediaUrl(media);
            scheduleSerialize();
          })
          .catch(() => {
            // Keep local image intact if media upload fails transiently.
          })
          .finally(() => {
            uploadingFileIdsRef.current.delete(fileId);
            setUploadingCount((c) => Math.max(0, c - 1));
          });
      }
    },
    [readOnly, scheduleSerialize],
  );

  const handleSceneChange = useCallback(
    (
      elements: readonly Record<string, unknown>[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      const activeCount = elements.filter((el) => el.isDeleted !== true).length;
      setElementCount(activeCount);

      latestSceneRef.current = {
        elements,
        appState,
        files,
      };

      uploadPendingBase64Files(files);
      if (!readOnly) {
        scheduleSerialize();
      }
    },
    [readOnly, scheduleSerialize, uploadPendingBase64Files],
  );

  // Cast initialData cleanly for Excalidraw's strict internal branded types.
  const initialData = useMemo(
    () =>
      ({
        elements: initialDoc.elements,
        appState: {
          ...initialDoc.appState,
          theme,
        },
        files: initialDoc.files,
      }) as unknown as Parameters<typeof Excalidraw>[0]["initialData"],
    [initialDoc, theme],
  );

  return (
    <section
      aria-label={`Excalidraw Editor: ${node.title}`}
      {...stylex.props(styles.root)}
    >
      <Toolbar aria-label="Excalidraw toolbar" {...stylex.props(styles.toolbar)}>
        <Inline gap="sm">
          <PenTool size={16} />
          <span {...stylex.props(styles.titleText)}>{node.title}</span>
          <Badge tone="accent">Excalidraw</Badge>
          <Badge tone="neutral">
            {elementCount} {elementCount === 1 ? "element" : "elements"}
          </Badge>
          {readOnly ? <Badge tone="neutral">Read-only</Badge> : null}
          {uploadingCount > 0 ? (
            <Badge tone="warning">
              <Upload size={12} />
              Uploading image...
            </Badge>
          ) : null}
        </Inline>

        <Inline gap="xs">
          {onSave && !readOnly ? (
            <Button disabled={saving} onClick={handleSave}>
              <Save size={14} />
              {saving ? "Saving..." : "Save"}
            </Button>
          ) : null}
        </Inline>
      </Toolbar>

      <div className="merak-excalidraw-host" {...stylex.props(styles.canvasWrap)}>
        <Excalidraw
          key={node.id}
          theme={theme}
          viewModeEnabled={readOnly}
          initialData={initialData}
          generateIdForFile={readOnly ? undefined : handleGenerateIdForFile}
          onChange={(elements, appState, files) =>
            handleSceneChange(
              elements as unknown as readonly Record<string, unknown>[],
              appState as unknown as Record<string, unknown>,
              files as unknown as Record<string, unknown>,
            )
          }
        />
      </div>
    </section>
  );
}
