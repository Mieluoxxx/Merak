import { API_ROUTES } from "@merak/shared";
import type { Hono } from "hono";
import { getAuthContext } from "../auth/middleware.js";
import { BadRequestError, NotFoundError } from "../services/errors.js";
import type { AppServices } from "../services/types.js";

function parseOptionalPositiveInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new BadRequestError("Dimension values must be positive integers");
  }
  return num;
}

function sanitizeHeaderFilename(filename: string): string {
  return filename.replace(/[\r\n"\\]/g, "_");
}

export function mountMediaRoutes(
  app: Hono<any, any, any>,
  services: AppServices,
): void {
  // Register /api/media/orphans BEFORE /api/media/:mediaId.
  app.get(API_ROUTES.mediaOrphans, async (c) => {
    const ctx = getAuthContext(c);
    const orphans = await services.media.listOrphans(ctx);
    return c.json(orphans);
  });

  app.get(API_ROUTES.media, async (c) => {
    const ctx = getAuthContext(c);
    const spaceId = c.req.query("spaceId") || undefined;
    const list = await services.media.listMedia(ctx, spaceId);
    return c.json(list);
  });

  app.post(API_ROUTES.media, async (c) => {
    const ctx = getAuthContext(c);

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      throw new BadRequestError("Expected multipart/form-data request");
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof Blob)) {
      throw new BadRequestError('Missing "file" field in form data');
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const filename =
      "name" in fileEntry && typeof fileEntry.name === "string" && fileEntry.name.trim()
        ? fileEntry.name.trim()
        : "upload";
    const mimeType = fileEntry.type || "application/octet-stream";

    const spaceIdEntry = formData.get("spaceId");
    const spaceId =
      typeof spaceIdEntry === "string" && spaceIdEntry.trim().length > 0
        ? spaceIdEntry.trim()
        : null;
    const width = parseOptionalPositiveInt(formData.get("width"));
    const height = parseOptionalPositiveInt(formData.get("height"));

    const uploaded = await services.media.uploadMedia(ctx, {
      spaceId,
      filename,
      mimeType,
      data,
      width,
      height,
    });

    return c.json(uploaded, 201);
  });

  app.get(`${API_ROUTES.media}/:mediaId`, async (c) => {
    const ctx = getAuthContext(c);
    const mediaId = c.req.param("mediaId");
    const result = await services.media.readMediaStream(ctx, mediaId);
    if (!result) {
      throw new NotFoundError("Media not found");
    }

    const { meta, data } = result;
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": meta.mimeType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: `"${meta.sha256}"`,
        "Content-Disposition": `inline; filename="${sanitizeHeaderFilename(meta.filename)}"`,
      },
    });
  });

  app.delete(`${API_ROUTES.media}/:mediaId`, async (c) => {
    const ctx = getAuthContext(c);
    const mediaId = c.req.param("mediaId");
    await services.media.deleteMedia(ctx, mediaId);
    return c.body(null, 204);
  });
}
