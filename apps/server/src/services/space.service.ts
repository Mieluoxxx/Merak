import {
  type CreateSpaceInput,
  rankAfter,
  type SpaceDto,
  type SpaceKind,
  type UpdateSpaceInput,
} from "@merak/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { MerakDb } from "../auth/index.js";
import {
  canAccessSpace,
  requireSpaceAccess,
  requireWritePermission,
} from "../auth/middleware.js";
import * as schema from "../db/schema.js";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors.js";
import type {
  AuthContext,
  RealtimeBroadcaster,
  SearchService,
  SpaceService,
} from "./types.js";

type SpaceRow = typeof schema.spaces.$inferSelect;

function toSpaceDto(row: SpaceRow): SpaceDto {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    description: row.description,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "space";
}

export interface SpaceServiceDeps {
  db: MerakDb;
  search: SearchService;
  realtime: RealtimeBroadcaster;
}

export function createSpaceService(deps: SpaceServiceDeps): SpaceService {
  const { db, search, realtime } = deps;

  return {
    async listSpaces(ctx: AuthContext, kind?: SpaceKind): Promise<SpaceDto[]> {
      const rows = await db
        .select()
        .from(schema.spaces)
        .where(
          kind
            ? and(eq(schema.spaces.orgId, ctx.orgId), eq(schema.spaces.kind, kind))
            : eq(schema.spaces.orgId, ctx.orgId),
        )
        .orderBy(asc(schema.spaces.sortOrder), asc(schema.spaces.createdAt));

      return rows
        .filter((row) => canAccessSpace(ctx, row.id))
        .map(toSpaceDto);
    },

    async getSpace(ctx: AuthContext, spaceId: string): Promise<SpaceDto | null> {
      const rows = await db
        .select()
        .from(schema.spaces)
        .where(
          and(eq(schema.spaces.id, spaceId), eq(schema.spaces.orgId, ctx.orgId)),
        )
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      requireSpaceAccess(ctx, row.id);
      return toSpaceDto(row);
    },

    async createSpace(
      ctx: AuthContext,
      input: CreateSpaceInput,
    ): Promise<SpaceDto> {
      requireWritePermission(ctx);
      if (
        ctx.authType === "mcp-token" &&
        ctx.tokenScopes &&
        ctx.tokenScopes.spaceIds !== "*"
      ) {
        throw new ForbiddenError("Space-scoped token cannot create spaces");
      }

      const explicitSlug = input.slug?.trim();
      let slug = explicitSlug || slugifyName(input.name);

      const existing = await db
        .select({ id: schema.spaces.id })
        .from(schema.spaces)
        .where(
          and(eq(schema.spaces.orgId, ctx.orgId), eq(schema.spaces.slug, slug)),
        )
        .limit(1);

      if (existing.length > 0) {
        if (explicitSlug) {
          throw new ConflictError(`Space with slug "${slug}" already exists`);
        }
        slug = `${slug}-${nanoid(5).toLowerCase()}`;
      }

      const lastSpaces = await db
        .select({ sortOrder: schema.spaces.sortOrder })
        .from(schema.spaces)
        .where(
          and(
            eq(schema.spaces.orgId, ctx.orgId),
            eq(schema.spaces.kind, input.kind),
          ),
        )
        .orderBy(desc(schema.spaces.sortOrder))
        .limit(1);

      const sortOrder = rankAfter(lastSpaces[0]?.sortOrder ?? null);
      const now = new Date().toISOString();
      const row: SpaceRow = {
        id: `spc_${nanoid(16)}`,
        orgId: ctx.orgId,
        kind: input.kind,
        slug,
        name: input.name,
        icon: input.icon ?? null,
        description: input.description ?? null,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.spaces).values(row);

      realtime.publish({
        type: "space.changed",
        orgId: ctx.orgId,
        spaceId: row.id,
        actorId: ctx.userId,
      });

      return toSpaceDto(row);
    },

    async updateSpace(
      ctx: AuthContext,
      spaceId: string,
      input: UpdateSpaceInput,
    ): Promise<SpaceDto> {
      requireWritePermission(ctx);
      requireSpaceAccess(ctx, spaceId);

      const rows = await db
        .select()
        .from(schema.spaces)
        .where(
          and(eq(schema.spaces.id, spaceId), eq(schema.spaces.orgId, ctx.orgId)),
        )
        .limit(1);

      const existing = rows[0];
      if (!existing) {
        throw new NotFoundError("Space not found");
      }

      const updated: SpaceRow = {
        ...existing,
        name: input.name ?? existing.name,
        icon: input.icon !== undefined ? input.icon : existing.icon,
        description:
          input.description !== undefined ? input.description : existing.description,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        updatedAt: new Date().toISOString(),
      };

      await db
        .update(schema.spaces)
        .set({
          name: updated.name,
          icon: updated.icon,
          description: updated.description,
          sortOrder: updated.sortOrder,
          updatedAt: updated.updatedAt,
        })
        .where(
          and(eq(schema.spaces.id, spaceId), eq(schema.spaces.orgId, ctx.orgId)),
        );

      realtime.publish({
        type: "space.changed",
        orgId: ctx.orgId,
        spaceId,
        actorId: ctx.userId,
      });

      return toSpaceDto(updated);
    },

    async deleteSpace(ctx: AuthContext, spaceId: string): Promise<void> {
      requireWritePermission(ctx);
      requireSpaceAccess(ctx, spaceId);

      const rows = await db
        .select({ id: schema.spaces.id })
        .from(schema.spaces)
        .where(
          and(eq(schema.spaces.id, spaceId), eq(schema.spaces.orgId, ctx.orgId)),
        )
        .limit(1);

      if (rows.length === 0) {
        throw new NotFoundError("Space not found");
      }

      const nodeRows = await db
        .select({ id: schema.nodes.id })
        .from(schema.nodes)
        .where(eq(schema.nodes.spaceId, spaceId));

      await db
        .delete(schema.spaces)
        .where(
          and(eq(schema.spaces.id, spaceId), eq(schema.spaces.orgId, ctx.orgId)),
        );

      for (const n of nodeRows) {
        search.removeNode(n.id);
      }

      realtime.publish({
        type: "space.changed",
        orgId: ctx.orgId,
        spaceId,
        actorId: ctx.userId,
      });
    },
  };
}
