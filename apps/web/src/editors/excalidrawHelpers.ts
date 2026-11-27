import {
  type ExcalidrawDocument,
  normalizeExcalidrawDocument,
} from "@merak/shared";

const PERSISTENT_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
  "objectsSnapModeEnabled",
  "theme",
] as const;

export function createEmptyExcalidrawDocument(): ExcalidrawDocument {
  return normalizeExcalidrawDocument({ elements: [] });
}

/**
 * Safely parses raw Excalidraw JSON content into a canonical ExcalidrawDocument.
 * Handles empty strings, malformed JSON, and partial LLM-generated scenes.
 */
export function parseExcalidrawContent(rawContent: string): ExcalidrawDocument {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return createEmptyExcalidrawDocument();
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return createEmptyExcalidrawDocument();
    }
    const candidate = parsed as Record<string, unknown>;
    if (!Array.isArray(candidate.elements)) {
      return createEmptyExcalidrawDocument();
    }
    return normalizeExcalidrawDocument(candidate);
  } catch {
    return createEmptyExcalidrawDocument();
  }
}

function sanitizeAppState(
  appState: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!appState) return {};
  const result: Record<string, unknown> = {};
  for (const key of PERSISTENT_APP_STATE_KEYS) {
    const value = appState[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeFiles(
  files: Record<string, unknown> | undefined,
  uploadedMediaMap: Readonly<Record<string, string>> | undefined,
): Record<string, unknown> {
  if (!files) return {};
  const nextFiles: Record<string, unknown> = {};

  for (const [fileId, rawEntry] of Object.entries(files)) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;
    const mappedUrl = uploadedMediaMap?.[fileId];
    const existingDataUrl = typeof entry.dataURL === "string" ? entry.dataURL : "";

    if (mappedUrl) {
      // Persist compact /api/media/:id reference instead of bloated inline base64 data.
      nextFiles[fileId] = {
        ...entry,
        id: fileId,
        dataURL: mappedUrl,
        mediaUrl: mappedUrl,
      };
    } else if (existingDataUrl.startsWith("/api/media/")) {
      nextFiles[fileId] = {
        ...entry,
        id: fileId,
        dataURL: existingDataUrl,
        mediaUrl: existingDataUrl,
      };
    } else {
      nextFiles[fileId] = {
        ...entry,
        id: fileId,
      };
    }
  }

  return nextFiles;
}

export interface SerializeExcalidrawInput {
  elements: readonly Record<string, unknown>[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  uploadedMediaMap?: Readonly<Record<string, string>>;
}

/**
 * Serializes an Excalidraw scene into canonical normalized JSON, replacing any
 * uploaded file entries with `/api/media/:id` references so documents stay lean.
 */
export function serializeExcalidrawDocument(input: SerializeExcalidrawInput): string {
  const activeElements = input.elements.filter((el) => el.isDeleted !== true);
  const normalized = normalizeExcalidrawDocument({
    type: "excalidraw",
    version: 2,
    source: "https://merak.local",
    elements: activeElements,
    appState: sanitizeAppState(input.appState),
    files: sanitizeFiles(input.files, input.uploadedMediaMap),
  });

  return JSON.stringify(normalized, null, 2);
}

export function countActiveExcalidrawElements(doc: ExcalidrawDocument): number {
  return doc.elements.filter((el) => el.isDeleted !== true).length;
}
