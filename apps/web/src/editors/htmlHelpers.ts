/**
 * Strict iframe sandbox attribute for HTML Artifacts.
 * MUST NEVER include `allow-same-origin`.
 */
export const HTML_ARTIFACT_SANDBOX = "allow-scripts" as const;

export const UI_SDK_WEB_CSS_HREF = "/ui-sdk/web.css";
export const UI_SDK_MERAK_CSS_HREF = "/ui-sdk/merak-ui.css";
export const UI_SDK_ARTIFACT_JS_SRC = "/ui-sdk/merak-artifact.js";

const UI_SDK_INJECTABLES = [
  {
    assetPath: UI_SDK_WEB_CSS_HREF,
    tag: `<link rel="stylesheet" href="${UI_SDK_WEB_CSS_HREF}">`,
  },
  {
    assetPath: UI_SDK_MERAK_CSS_HREF,
    tag: `<link rel="stylesheet" href="${UI_SDK_MERAK_CSS_HREF}">`,
  },
  {
    assetPath: UI_SDK_ARTIFACT_JS_SRC,
    tag: `<script src="${UI_SDK_ARTIFACT_JS_SRC}"></script>`,
  },
] as const;

function hasAssetReference(html: string, assetPath: string): boolean {
  const escaped = assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:href|src)\\s*=\\s*["'][^"']*${escaped}[^"']*["']`, "i");
  return pattern.test(html);
}

/**
 * Automatically injects `/ui-sdk/web.css`, `/ui-sdk/merak-ui.css`, and
 * `/ui-sdk/merak-artifact.js` into the HTML document `<head>` (or prepends for
 * fragments) without duplicating any asset already referenced by the author.
 */
export function injectUiSdkIntoHtml(rawHtml: string): string {
  const missingTags = UI_SDK_INJECTABLES.filter(
    (item) => !hasAssetReference(rawHtml, item.assetPath),
  ).map((item) => item.tag);

  if (missingTags.length === 0) {
    return rawHtml;
  }

  const injectionBlock = missingTags.join("\n");

  const headOpenMatch = /<head(?:\s[^>]*)?>/i.exec(rawHtml);
  if (headOpenMatch && headOpenMatch.index !== undefined) {
    const insertPos = headOpenMatch.index + headOpenMatch[0].length;
    return `${rawHtml.slice(0, insertPos)}\n${injectionBlock}\n${rawHtml.slice(insertPos)}`;
  }

  const htmlOpenMatch = /<html(?:\s[^>]*)?>/i.exec(rawHtml);
  if (htmlOpenMatch && htmlOpenMatch.index !== undefined) {
    const insertPos = htmlOpenMatch.index + htmlOpenMatch[0].length;
    return `${rawHtml.slice(0, insertPos)}\n<head>\n${injectionBlock}\n</head>\n${rawHtml.slice(insertPos)}`;
  }

  return `${injectionBlock}\n${rawHtml}`;
}

export type ArtifactConsoleLevel = "log" | "info" | "warn" | "error";

export interface ArtifactConsoleEntry {
  id: string;
  level: ArtifactConsoleLevel;
  message: string;
  timestamp: string;
}

export type ArtifactBridgeMessage =
  | { type: "merak:ready" }
  | { type: "merak:console"; level: ArtifactConsoleLevel; message: string };

function normalizeConsoleLevel(level: unknown): ArtifactConsoleLevel {
  if (level === "error" || level === "warn" || level === "info" || level === "log") {
    return level;
  }
  return "log";
}

function formatBridgeArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function parseArtifactBridgeMessage(data: unknown): ArtifactBridgeMessage | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  if (record.type === "merak:ready") {
    return { type: "merak:ready" };
  }

  if (record.type === "merak:console") {
    const level = normalizeConsoleLevel(record.level);
    let message = "";
    if (typeof record.message === "string") {
      message = record.message;
    } else if (Array.isArray(record.args)) {
      message = record.args.map(formatBridgeArg).join(" ");
    } else if (record.args !== undefined) {
      message = formatBridgeArg(record.args);
    }
    return { type: "merak:console", level, message };
  }

  return null;
}
