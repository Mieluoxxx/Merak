import {
  API_ROUTES,
  extractMediaIdsFromContent,
  type MediaDto,
  type MediaWithRefsDto,
} from "@merak/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { MerakDb } from "../auth/index.js";
import {
  canAccessSpace,
  requireSpaceAccess,
  requireWritePermission,
} from "../auth/middleware.js";
import * as schema from "../db/schema.js";
import {
  buildStorageKey,
  computeSha256,
  deleteMediaFile,
  mediaFileExists,
  readMediaFile,
  writeMediaFile,
} from "../media/storage.js";
import { NotFoundError } from "./errors.js";
import type {
  AuthContext,
  MediaService,
  RealtimeBroadcaster,
  UploadMediaInput,
} from "./types.js";

type MediaRow = typeof schema.media.$inferSelect;

function toMediaDto(row: MediaRow): MediaDto {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId,
    sha256: row.sha256,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    url: API_ROUTES.mediaById(row.id),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function extractAllMediaIds(content: string): string[] {
  const ids = new Set<string>(extractMediaIdsFromContent(content));
  // Also collect direct mediaId references from JSON Canvas file nodes if present.
  if (content.includes('"mediaId"')) {
    try {
      const parsed = JSON.parse(content) as {
        nodes?: Array<{ mediaId?: unknown }>;
      };
      if (Array.isArray(parsed.nodes)) {
        for (const node of parsed.nodes) {
          if (typeof node.mediaId === "string" && node.mediaId.trim().length > 0) {
            ids.add(node.mediaId.trim());
          }
        }
      }
    } catch {
      // Not valid JSON; regex extraction above already covers text/HTML/Markdown.
    }
  }
  return [...ids];
}

export interface MediaServiceDeps {
  db: MerakDb;
  mediaDir: string;
  realtime: RealtimeBroadcaster;
}

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const { db, mediaDir, realtime } = deps;

  async function hydrateWithRefs(rows: MediaRow[]): Promise<MediaWithRefsDto[]> {
    if (rows.length === 0) return [];
    const mediaIds = rows.map((r) => r.id);
    const refs = await db
      .select({
        mediaId: schema.mediaRefs.mediaId,
        nodeId: schema.mediaRefs.nodeId,
      })
      .from(schema.mediaRefs)
      .where(inArray(schema.mediaRefs.mediaId, mediaIds));

    const refMap = new Map<string, string[]>();
    for (const ref of refs) {
      let list = refMap.get(ref.mediaId);
      if (!list) {
        list = [];
        refMap.set(ref.mediaId, list);
      }
      list.push(ref.nodeId);
    }

    return rows.map((row) => {
      const refNodeIds = refMap.get(row.id) ?? [];
      return {
        ...toMediaDto(row),
        refNodeIds,
        refCount: refNodeIds.length,
      };
    });
  }

  return {
    async uploadMedia(
      ctx: AuthContext,
      input: UploadMediaInput,
    ): Promise<MediaDto> {
      requireWritePermission(ctx);

      const spaceId = input.spaceId ?? null;
      if (spaceId !== null) {
        const spaceRows = await db
          .select({ id: schema.spaces.id })
          .from(schema.spaces)
          .where(
            and(eq(schema.spaces.id, spaceId), eq(schema.spaces.orgId, ctx.orgId)),
          )
          .limit(1);
        if (spaceRows.length === 0) {
          throw new NotFoundError("Space not found");
        }
        requireSpaceAccess(ctx, spaceId);
      }

      const sha256 = computeSha256(input.data);
      const existingRows = await db
        .select()
        .from(schema.media)
        .where(
          and(eq(schema.media.orgId, ctx.orgId), eq(schema.media.sha256, sha256)),
        )
        .limit(1);

      const existing = existingRows[0];
      if (existing) {
        const exists = await mediaFileExists(mediaDir, existing.storageKey);
        if (!exists) {
          await writeMediaFile(mediaDir, existing.storageKey, input.data);
        }
        return toMediaDto(existing);
      }

      const id = `med_${nanoid(16)}`;
      const storageKey = buildStorageKey(ctx.orgId, sha256);
      await writeMediaFile(mediaDir, storageKey, input.data);

      const now = new Date().toISOString();
      const row: MediaRow = {
        id,
        orgId: ctx.orgId,
        spaceId,
        sha256,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.data.byteLength,
        width: input.width ?? null,
        height: input.height ?? null,
        storageKey,
        createdBy: ctx.userId,
        createdAt: now,
      };

      await db.insert(schema.media).values(row);

      realtime.publish({
        type: "media.created",
        orgId: ctx.orgId,
        spaceId,
        mediaId: id,
        actorId: ctx.userId,
      });

      return toMediaDto(row);
    },

    async listMedia(
      ctx: AuthContext,
      spaceId?: string | null,
    ): Promise<MediaWithRefsDto[]> {
      if (spaceId) {
        requireSpaceAccess(ctx, spaceId);
      }

      const rows = await db
        .select()
        .from(schema.media)
        .where(
          spaceId
            ? and(
                eq(schema.media.orgId, ctx.orgId),
                eq(schema.media.spaceId, spaceId),
              )
            : eq(schema.media.orgId, ctx.orgId),
        )
        .orderBy(desc(schema.media.createdAt));

      const scopedRows = rows.filter(
        (row) => row.spaceId === null || canAccessSpace(ctx, row.spaceId),
      );
      return hydrateWithRefs(scopedRows);
    },

    async listOrphans(ctx: AuthContext): Promise<MediaWithRefsDto[]> {
      const all = await this.listMedia(ctx);
      return all.filter((item) => item.refCount === 0);
    },

    async getMediaMeta(
      ctx: AuthContext,
      mediaId: string,
    ): Promise<MediaDto | null> {
      const rows = await db
        .select()
        .from(schema.media)
        .where(
          and(eq(schema.media.id, mediaId), eq(schema.media.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      if (row.spaceId) {
        requireSpaceAccess(ctx, row.spaceId);
      }
      return toMediaDto(row);
    },

    async readMediaStream(
      ctx: AuthContext,
      mediaId: string,
    ): Promise<{ meta: MediaDto; data: Buffer } | null> {
      const rows = await db
        .select()
        .from(schema.media)
        .where(
          and(eq(schema.media.id, mediaId), eq(schema.media.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      if (row.spaceId) {
        requireSpaceAccess(ctx, row.spaceId);
      }

      const data = await readMediaFile(mediaDir, row.storageKey);
      if (!data) return null;

      return {
        meta: toMediaDto(row),
        data,
      };
    },

    async deleteMedia(ctx: AuthContext, mediaId: string): Promise<void> {
      requireWritePermission(ctx);

      const rows = await db
        .select()
        .from(schema.media)
        .where(
          and(eq(schema.media.id, mediaId), eq(schema.media.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new NotFoundError("Media not found");
      }
      if (row.spaceId) {
        requireSpaceAccess(ctx, row.spaceId);
      }

      await db
        .delete(schema.media)
        .where(
          and(eq(schema.media.id, mediaId), eq(schema.media.orgId, ctx.orgId)),
        );

      const remaining = await db
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(eq(schema.media.storageKey, row.storageKey))
        .limit(1);

      if (remaining.length === 0) {
        await deleteMediaFile(mediaDir, row.storageKey);
      }

      realtime.publish({
        type: "media.deleted",
        orgId: ctx.orgId,
        spaceId: row.spaceId,
        mediaId: row.id,
        actorId: ctx.userId,
      });
    },

    async syncRefsForNode(nodeId: string, content: string): Promise<void> {
      await db
        .delete(schema.mediaRefs)
        .where(eq(schema.mediaRefs.nodeId, nodeId));

      const candidateIds = extractAllMediaIds(content);
      if (candidateIds.length === 0) {
        return;
      }

      const nodeRows = await db
        .select({ orgId: schema.spaces.orgId })
        .from(schema.nodes)
        .innerJoin(schema.spaces, eq(schema.nodes.spaceId, schema.spaces.id))
        .where(eq(schema.nodes.id, nodeId))
        .limit(1);

      const nodeOrgId = nodeRows[0]?.orgId;
      if (!nodeOrgId) {
        return;
      }

      const validMediaRows = await db
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(
          and(
            eq(schema.media.orgId, nodeOrgId),
            inArray(schema.media.id, candidateIds),
          ),
        );

      if (validMediaRows.length === 0) {
        return;
      }

      await db
        .insert(schema.mediaRefs)
        .values(validMediaRows.map((m) => ({ mediaId: m.id, nodeId })))
        .onConflictDoNothing();
    },
  };
}
