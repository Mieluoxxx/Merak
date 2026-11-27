import {
  type CreateNodeInput,
  type MoveNodeInput,
  type NodeDetailDto,
  type NodeTreeItemDto,
  type PatchDocInput,
  rankAfter,
  type UpdateNodeInput,
} from "@merak/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { MerakDb } from "../auth/index.js";
import {
  canAccessSpace,
  requireSpaceAccess,
  requireWritePermission,
} from "../auth/middleware.js";
import * as schema from "../db/schema.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from "./errors.js";
import type {
  AuthContext,
  MediaService,
  NodeService,
  RealtimeBroadcaster,
  SearchService,
} from "./types.js";

type NodeRow = typeof schema.nodes.$inferSelect;
type SpaceRow = typeof schema.spaces.$inferSelect;

function compareLexo(a: { sortOrder: string; id: string }, b: { sortOrder: string; id: string }): number {
  if (a.sortOrder < b.sortOrder) return -1;
  if (a.sortOrder > b.sortOrder) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function toNodeDetailDto(row: NodeRow, hasChildren?: boolean): NodeDetailDto {
  return {
    id: row.id,
    spaceId: row.spaceId,
    parentId: row.parentId,
    type: row.type,
    title: row.title,
    icon: row.icon,
    sortOrder: row.sortOrder,
    version: row.version,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    hasChildren,
    content: row.content,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    deletedAt: row.deletedAt,
  };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + needle.length;
  }
  return count;
}

export interface NodeServiceDeps {
  db: MerakDb;
  search: SearchService;
  media: MediaService;
  realtime: RealtimeBroadcaster;
}

export function createNodeService(deps: NodeServiceDeps): NodeService {
  const { db, search, media, realtime } = deps;

  async function assertSpaceInOrg(
    ctx: AuthContext,
    spaceId: string,
  ): Promise<SpaceRow> {
    const rows = await db
      .select()
      .from(schema.spaces)
      .where(
        and(eq(schema.spaces.id, spaceId), eq(schema.spaces.orgId, ctx.orgId)),
      )
      .limit(1);

    const space = rows[0];
    if (!space) {
      throw new NotFoundError("Space not found");
    }
    requireSpaceAccess(ctx, space.id);
    return space;
  }

  async function findNodeInOrg(
    ctx: AuthContext,
    nodeId: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<{ node: NodeRow; space: SpaceRow } | null> {
    const rows = await db
      .select({
        node: schema.nodes,
        space: schema.spaces,
      })
      .from(schema.nodes)
      .innerJoin(schema.spaces, eq(schema.nodes.spaceId, schema.spaces.id))
      .where(
        and(eq(schema.nodes.id, nodeId), eq(schema.spaces.orgId, ctx.orgId)),
      )
      .limit(1);

    const record = rows[0];
    if (!record) return null;
    if (!opts?.includeDeleted && record.node.deletedAt !== null) {
      return null;
    }

    requireSpaceAccess(ctx, record.space.id);
    return record;
  }

  async function hasActiveChildren(nodeId: string): Promise<boolean> {
    const rows = await db
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(
        and(eq(schema.nodes.parentId, nodeId), isNull(schema.nodes.deletedAt)),
      )
      .limit(1);
    return rows.length > 0;
  }

  return {
    async getTree(
      ctx: AuthContext,
      spaceId: string,
    ): Promise<NodeTreeItemDto[]> {
      await assertSpaceInOrg(ctx, spaceId);

      const rows = await db
        .select()
        .from(schema.nodes)
        .where(
          and(eq(schema.nodes.spaceId, spaceId), isNull(schema.nodes.deletedAt)),
        )
        .orderBy(asc(schema.nodes.sortOrder), asc(schema.nodes.createdAt));

      const itemMap = new Map<string, NodeTreeItemDto>();
      for (const row of rows) {
        itemMap.set(row.id, {
          id: row.id,
          spaceId: row.spaceId,
          parentId: row.parentId,
          type: row.type,
          title: row.title,
          icon: row.icon,
          sortOrder: row.sortOrder,
          version: row.version,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
          hasChildren: false,
          children: [],
        });
      }

      const roots: NodeTreeItemDto[] = [];
      for (const item of itemMap.values()) {
        if (item.parentId && itemMap.has(item.parentId)) {
          const parent = itemMap.get(item.parentId)!;
          parent.children.push(item);
        } else {
          roots.push(item);
        }
      }

      const sortTree = (items: NodeTreeItemDto[]): void => {
        items.sort(compareLexo);
        for (const item of items) {
          item.hasChildren = item.children.length > 0;
          if (item.children.length > 0) {
            sortTree(item.children);
          }
        }
      };

      sortTree(roots);
      return roots;
    },

    async getNode(
      ctx: AuthContext,
      nodeId: string,
    ): Promise<NodeDetailDto | null> {
      const record = await findNodeInOrg(ctx, nodeId);
      if (!record) return null;
      const childrenExist = await hasActiveChildren(nodeId);
      return toNodeDetailDto(record.node, childrenExist);
    },

    async createNode(
      ctx: AuthContext,
      input: CreateNodeInput,
    ): Promise<NodeDetailDto> {
      requireWritePermission(ctx);
      const space = await assertSpaceInOrg(ctx, input.spaceId);

      const parentId = input.parentId ?? null;
      if (parentId !== null) {
        const parentRows = await db
          .select({ id: schema.nodes.id })
          .from(schema.nodes)
          .where(
            and(
              eq(schema.nodes.id, parentId),
              eq(schema.nodes.spaceId, space.id),
              isNull(schema.nodes.deletedAt),
            ),
          )
          .limit(1);

        if (parentRows.length === 0) {
          throw new BadRequestError("Parent node not found in target space");
        }
      }

      let sortOrder = input.sortOrder;
      if (!sortOrder) {
        const siblings = await db
          .select({ sortOrder: schema.nodes.sortOrder })
          .from(schema.nodes)
          .where(
            and(
              eq(schema.nodes.spaceId, space.id),
              parentId === null
                ? isNull(schema.nodes.parentId)
                : eq(schema.nodes.parentId, parentId),
              isNull(schema.nodes.deletedAt),
            ),
          );

        let maxSort: string | null = null;
        for (const sibling of siblings) {
          if (maxSort === null || sibling.sortOrder > maxSort) {
            maxSort = sibling.sortOrder;
          }
        }
        sortOrder = rankAfter(maxSort);
      }

      const id = `nod_${nanoid(16)}`;
      const now = new Date().toISOString();
      const content = input.content ?? "";

      const row: NodeRow = {
        id,
        spaceId: space.id,
        parentId,
        type: input.type,
        title: input.title,
        icon: input.icon ?? null,
        sortOrder,
        content,
        version: 1,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      await db.insert(schema.nodes).values(row);

      search.indexNode({
        id: row.id,
        spaceId: row.spaceId,
        orgId: ctx.orgId,
        type: row.type,
        title: row.title,
        content: row.content,
      });

      await media.syncRefsForNode(row.id, row.content);

      realtime.publish({
        type: "node.created",
        orgId: ctx.orgId,
        spaceId: row.spaceId,
        nodeId: row.id,
        parentId: row.parentId,
        actorId: ctx.userId,
      });

      return toNodeDetailDto(row, false);
    },

    async updateNode(
      ctx: AuthContext,
      nodeId: string,
      input: UpdateNodeInput,
    ): Promise<NodeDetailDto> {
      requireWritePermission(ctx);
      const record = await findNodeInOrg(ctx, nodeId);
      if (!record) {
        throw new NotFoundError("Node not found");
      }

      const { node } = record;
      if (
        input.expectedVersion !== undefined &&
        node.version !== input.expectedVersion
      ) {
        throw new ConflictError(
          `Version conflict: expected ${input.expectedVersion}, current ${node.version}`,
          {
            expectedVersion: input.expectedVersion,
            currentVersion: node.version,
          },
        );
      }

      const nextTitle = input.title ?? node.title;
      const nextIcon = input.icon !== undefined ? input.icon : node.icon;
      const nextContent = input.content !== undefined ? input.content : node.content;
      const nextVersion = node.version + 1;
      const now = new Date().toISOString();

      const updatedRows = await db
        .update(schema.nodes)
        .set({
          title: nextTitle,
          icon: nextIcon,
          content: nextContent,
          version: nextVersion,
          updatedBy: ctx.userId,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.nodes.id, nodeId),
            eq(schema.nodes.version, node.version),
            isNull(schema.nodes.deletedAt),
          ),
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        throw new ConflictError("Concurrent update conflict");
      }

      search.indexNode({
        id: updated.id,
        spaceId: updated.spaceId,
        orgId: ctx.orgId,
        type: updated.type,
        title: updated.title,
        content: updated.content,
      });

      if (input.content !== undefined) {
        await media.syncRefsForNode(updated.id, updated.content);
      }

      realtime.publish({
        type: "node.updated",
        orgId: ctx.orgId,
        spaceId: updated.spaceId,
        nodeId: updated.id,
        version: updated.version,
        actorId: ctx.userId,
      });

      const childrenExist = await hasActiveChildren(updated.id);
      return toNodeDetailDto(updated, childrenExist);
    },

    async patchDoc(
      ctx: AuthContext,
      nodeId: string,
      input: PatchDocInput,
    ): Promise<NodeDetailDto> {
      requireWritePermission(ctx);
      const record = await findNodeInOrg(ctx, nodeId);
      if (!record) {
        throw new NotFoundError("Node not found");
      }

      const { node } = record;
      if (
        input.expectedVersion !== undefined &&
        node.version !== input.expectedVersion
      ) {
        throw new ConflictError(
          `Version conflict: expected ${input.expectedVersion}, current ${node.version}`,
          {
            expectedVersion: input.expectedVersion,
            currentVersion: node.version,
          },
        );
      }

      const occurrences = countOccurrences(node.content, input.oldText);
      if (occurrences === 0) {
        throw new UnprocessableEntityError("Target text not found in document");
      }
      if (occurrences > 1 && !input.replaceAll) {
        throw new UnprocessableEntityError(
          `Target text matched ${occurrences} times; set replaceAll: true or provide more context`,
        );
      }

      let nextContent: string;
      if (input.replaceAll) {
        nextContent = node.content.split(input.oldText).join(input.newText);
      } else {
        const idx = node.content.indexOf(input.oldText);
        nextContent =
          node.content.slice(0, idx) +
          input.newText +
          node.content.slice(idx + input.oldText.length);
      }

      const nextVersion = node.version + 1;
      const now = new Date().toISOString();

      const updatedRows = await db
        .update(schema.nodes)
        .set({
          content: nextContent,
          version: nextVersion,
          updatedBy: ctx.userId,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.nodes.id, nodeId),
            eq(schema.nodes.version, node.version),
            isNull(schema.nodes.deletedAt),
          ),
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        throw new ConflictError("Concurrent update conflict");
      }

      search.indexNode({
        id: updated.id,
        spaceId: updated.spaceId,
        orgId: ctx.orgId,
        type: updated.type,
        title: updated.title,
        content: updated.content,
      });

      await media.syncRefsForNode(updated.id, updated.content);

      realtime.publish({
        type: "node.updated",
        orgId: ctx.orgId,
        spaceId: updated.spaceId,
        nodeId: updated.id,
        version: updated.version,
        actorId: ctx.userId,
      });

      const childrenExist = await hasActiveChildren(updated.id);
      return toNodeDetailDto(updated, childrenExist);
    },

    async moveNode(
      ctx: AuthContext,
      nodeId: string,
      input: MoveNodeInput,
    ): Promise<NodeDetailDto> {
      requireWritePermission(ctx);
      const record = await findNodeInOrg(ctx, nodeId);
      if (!record) {
        throw new NotFoundError("Node not found");
      }

      const { node } = record;
      const targetParentId = input.parentId ?? null;

      if (targetParentId === nodeId) {
        throw new BadRequestError("Cannot move a node under itself");
      }

      if (targetParentId !== null) {
        const spaceNodes = await db
          .select({
            id: schema.nodes.id,
            parentId: schema.nodes.parentId,
          })
          .from(schema.nodes)
          .where(
            and(
              eq(schema.nodes.spaceId, node.spaceId),
              isNull(schema.nodes.deletedAt),
            ),
          );

        const parentById = new Map<string, string | null>();
        for (const row of spaceNodes) {
          parentById.set(row.id, row.parentId);
        }

        if (!parentById.has(targetParentId)) {
          throw new BadRequestError("Target parent node not found in space");
        }

        const visited = new Set<string>([nodeId]);
        let cursor: string | null = targetParentId;
        while (cursor !== null) {
          if (visited.has(cursor)) {
            throw new BadRequestError(
              "Cannot move a node under its own descendant",
            );
          }
          visited.add(cursor);
          cursor = parentById.get(cursor) ?? null;
        }
      }

      const nextVersion = node.version + 1;
      const now = new Date().toISOString();

      const updatedRows = await db
        .update(schema.nodes)
        .set({
          parentId: targetParentId,
          sortOrder: input.sortOrder,
          version: nextVersion,
          updatedBy: ctx.userId,
          updatedAt: now,
        })
        .where(
          and(eq(schema.nodes.id, nodeId), isNull(schema.nodes.deletedAt)),
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        throw new NotFoundError("Node not found");
      }

      realtime.publish({
        type: "tree.changed",
        orgId: ctx.orgId,
        spaceId: updated.spaceId,
        actorId: ctx.userId,
      });

      const childrenExist = await hasActiveChildren(updated.id);
      return toNodeDetailDto(updated, childrenExist);
    },

    async softDeleteNode(ctx: AuthContext, nodeId: string): Promise<void> {
      requireWritePermission(ctx);
      const record = await findNodeInOrg(ctx, nodeId);
      if (!record) {
        throw new NotFoundError("Node not found");
      }

      const { node } = record;
      const activeNodes = await db
        .select({
          id: schema.nodes.id,
          parentId: schema.nodes.parentId,
        })
        .from(schema.nodes)
        .where(
          and(
            eq(schema.nodes.spaceId, node.spaceId),
            isNull(schema.nodes.deletedAt),
          ),
        );

      const childrenMap = new Map<string, string[]>();
      for (const n of activeNodes) {
        if (n.parentId) {
          let list = childrenMap.get(n.parentId);
          if (!list) {
            list = [];
            childrenMap.set(n.parentId, list);
          }
          list.push(n.id);
        }
      }

      const toDelete: string[] = [];
      const queue: string[] = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        toDelete.push(current);
        const kids = childrenMap.get(current);
        if (kids) {
          queue.push(...kids);
        }
      }

      const now = new Date().toISOString();
      await db
        .update(schema.nodes)
        .set({
          deletedAt: now,
          updatedBy: ctx.userId,
          updatedAt: now,
        })
        .where(inArray(schema.nodes.id, toDelete));

      for (const id of toDelete) {
        search.removeNode(id);
        await media.syncRefsForNode(id, "");
      }

      realtime.publish({
        type: "node.deleted",
        orgId: ctx.orgId,
        spaceId: node.spaceId,
        nodeId,
        actorId: ctx.userId,
      });
    },

    async restoreNode(
      ctx: AuthContext,
      nodeId: string,
    ): Promise<NodeDetailDto> {
      requireWritePermission(ctx);
      const record = await findNodeInOrg(ctx, nodeId, { includeDeleted: true });
      if (!record) {
        throw new NotFoundError("Node not found");
      }

      const { node } = record;
      if (node.deletedAt === null) {
        const childrenExist = await hasActiveChildren(node.id);
        return toNodeDetailDto(node, childrenExist);
      }

      const deletedTimestamp = node.deletedAt;

      let nextParentId = node.parentId;
      if (nextParentId !== null) {
        const parentRows = await db
          .select({ id: schema.nodes.id, deletedAt: schema.nodes.deletedAt })
          .from(schema.nodes)
          .where(
            and(
              eq(schema.nodes.id, nextParentId),
              eq(schema.nodes.spaceId, node.spaceId),
            ),
          )
          .limit(1);

        const parent = parentRows[0];
        if (!parent || parent.deletedAt !== null) {
          nextParentId = null;
        }
      }

      // Collect descendants that were soft-deleted in the same cascade batch.
      const sameBatchDeleted = await db
        .select()
        .from(schema.nodes)
        .where(
          and(
            eq(schema.nodes.spaceId, node.spaceId),
            eq(schema.nodes.deletedAt, deletedTimestamp),
          ),
        );

      const childrenByParent = new Map<string, NodeRow[]>();
      for (const row of sameBatchDeleted) {
        if (row.parentId) {
          let list = childrenByParent.get(row.parentId);
          if (!list) {
            list = [];
            childrenByParent.set(row.parentId, list);
          }
          list.push(row);
        }
      }

      const descendantsToRestore: NodeRow[] = [];
      const queue: string[] = [node.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const kids = childrenByParent.get(current) ?? [];
        for (const kid of kids) {
          descendantsToRestore.push(kid);
          queue.push(kid.id);
        }
      }

      const now = new Date().toISOString();
      const restoredRootRows = await db
        .update(schema.nodes)
        .set({
          parentId: nextParentId,
          deletedAt: null,
          updatedBy: ctx.userId,
          updatedAt: now,
        })
        .where(eq(schema.nodes.id, node.id))
        .returning();

      const restoredRoot = restoredRootRows[0]!;

      if (descendantsToRestore.length > 0) {
        await db
          .update(schema.nodes)
          .set({
            deletedAt: null,
            updatedBy: ctx.userId,
            updatedAt: now,
          })
          .where(
            inArray(
              schema.nodes.id,
              descendantsToRestore.map((d) => d.id),
            ),
          );
      }

      const allRestored = [restoredRoot, ...descendantsToRestore];
      for (const item of allRestored) {
        search.indexNode({
          id: item.id,
          spaceId: item.spaceId,
          orgId: ctx.orgId,
          type: item.type,
          title: item.title,
          content: item.content,
        });
        await media.syncRefsForNode(item.id, item.content);
      }

      realtime.publish({
        type: "node.created",
        orgId: ctx.orgId,
        spaceId: restoredRoot.spaceId,
        nodeId: restoredRoot.id,
        parentId: restoredRoot.parentId,
        actorId: ctx.userId,
      });

      const childrenExist = await hasActiveChildren(restoredRoot.id);
      return toNodeDetailDto(restoredRoot, childrenExist);
    },

    async listTrash(
      ctx: AuthContext,
      spaceId?: string,
    ): Promise<NodeDetailDto[]> {
      if (spaceId) {
        await assertSpaceInOrg(ctx, spaceId);
      }

      const rows = await db
        .select({ node: schema.nodes })
        .from(schema.nodes)
        .innerJoin(schema.spaces, eq(schema.nodes.spaceId, schema.spaces.id))
        .where(
          spaceId
            ? and(
                eq(schema.spaces.orgId, ctx.orgId),
                eq(schema.nodes.spaceId, spaceId),
                isNotNull(schema.nodes.deletedAt),
              )
            : and(
                eq(schema.spaces.orgId, ctx.orgId),
                isNotNull(schema.nodes.deletedAt),
              ),
        )
        .orderBy(desc(schema.nodes.deletedAt));

      return rows
        .filter((r) => canAccessSpace(ctx, r.node.spaceId))
        .map((r) => toNodeDetailDto(r.node, false));
    },
  };
}
