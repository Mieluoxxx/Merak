import type {
  CommentMessageDto,
  CommentThreadDto,
  CreateCommentThreadInput,
  ReplyCommentInput,
  UpdateCommentMessageInput,
  UpdateCommentThreadInput,
} from "@merak/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { MerakDb } from "../auth/index.js";
import {
  canViewSpace,
  requireSpaceAccess,
  requireWritePermission,
} from "../auth/middleware.js";
import * as schema from "../db/schema.js";
import { ForbiddenError, NotFoundError } from "./errors.js";
import type { AuthContext, CommentService, RealtimeBroadcaster } from "./types.js";

type ThreadRow = typeof schema.commentThreads.$inferSelect;
type NodeRow = typeof schema.nodes.$inferSelect;
type SpaceRow = typeof schema.spaces.$inferSelect;

export interface CommentServiceDeps {
  db: MerakDb;
  realtime: RealtimeBroadcaster;
}

export function createCommentService(deps: CommentServiceDeps): CommentService {
  const { db, realtime } = deps;

  async function assertNodeAccess(
    ctx: AuthContext,
    nodeId: string,
    requireWrite: boolean,
  ): Promise<{ node: NodeRow; space: SpaceRow }> {
    const rows = await db
      .select({
        node: schema.nodes,
        space: schema.spaces,
      })
      .from(schema.nodes)
      .innerJoin(schema.spaces, eq(schema.nodes.spaceId, schema.spaces.id))
      .where(
        and(
          eq(schema.nodes.id, nodeId),
          eq(schema.spaces.orgId, ctx.orgId),
          isNull(schema.nodes.deletedAt),
        ),
      )
      .limit(1);

    const match = rows[0];
    if (!match || !canViewSpace(ctx, match.space)) {
      throw new NotFoundError("Node not found");
    }
    requireSpaceAccess(ctx, match.space.id);
    if (requireWrite) {
      requireWritePermission(ctx);
    }
    return match;
  }

  async function hydrateThreads(rows: ThreadRow[]): Promise<CommentThreadDto[]> {
    if (rows.length === 0) return [];
    const threadIds = rows.map((row) => row.id);
    const messageRows = await db
      .select({
        message: schema.commentMessages,
        author: {
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          image: schema.user.image,
        },
      })
      .from(schema.commentMessages)
      .innerJoin(schema.user, eq(schema.commentMessages.authorId, schema.user.id))
      .where(inArray(schema.commentMessages.threadId, threadIds))
      .orderBy(asc(schema.commentMessages.createdAt), asc(schema.commentMessages.id));

    const messagesByThread = new Map<string, CommentMessageDto[]>();
    for (const row of messageRows) {
      const list = messagesByThread.get(row.message.threadId) ?? [];
      list.push({
        id: row.message.id,
        threadId: row.message.threadId,
        body: row.message.body,
        author: {
          id: row.author.id,
          name: row.author.name,
          email: row.author.email,
          image: row.author.image ?? null,
        },
        createdAt: row.message.createdAt,
        updatedAt: row.message.updatedAt,
      });
      messagesByThread.set(row.message.threadId, list);
    }

    return rows.map((row) => ({
      id: row.id,
      nodeId: row.nodeId,
      blockIndex: row.blockIndex,
      blockType: row.blockType,
      quote: row.quote,
      status: row.status,
      resolvedBy: row.resolvedBy ?? null,
      resolvedAt: row.resolvedAt ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messages: messagesByThread.get(row.id) ?? [],
    }));
  }

  async function getHydratedThreadOrThrow(nodeId: string, threadId: string): Promise<CommentThreadDto> {
    const rows = await db
      .select()
      .from(schema.commentThreads)
      .where(and(eq(schema.commentThreads.id, threadId), eq(schema.commentThreads.nodeId, nodeId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundError("Comment thread not found");
    }
    const hydrated = await hydrateThreads([row]);
    const dto = hydrated[0];
    if (!dto) {
      throw new NotFoundError("Comment thread not found");
    }
    return dto;
  }

  function publishCommentChanged(ctx: AuthContext, spaceId: string, nodeId: string): void {
    realtime.publish({
      type: "comment.changed",
      orgId: ctx.orgId,
      spaceId,
      nodeId,
      actorId: ctx.userId,
    });
  }

  return {
    async listThreads(ctx, nodeId, opts) {
      await assertNodeAccess(ctx, nodeId, false);
      const condition = opts?.includeResolved
        ? eq(schema.commentThreads.nodeId, nodeId)
        : and(eq(schema.commentThreads.nodeId, nodeId), eq(schema.commentThreads.status, "open"));

      const rows = await db
        .select()
        .from(schema.commentThreads)
        .where(condition)
        .orderBy(asc(schema.commentThreads.blockIndex), asc(schema.commentThreads.createdAt));

      return hydrateThreads(rows);
    },

    async createThread(ctx, nodeId, input: CreateCommentThreadInput) {
      const { space } = await assertNodeAccess(ctx, nodeId, true);
      const now = new Date().toISOString();
      const threadId = `thd_${nanoid(12)}`;
      const messageId = `msg_${nanoid(12)}`;

      db.transaction((tx) => {
        tx.insert(schema.commentThreads)
          .values({
            id: threadId,
            nodeId,
            blockIndex: input.blockIndex,
            blockType: input.blockType,
            quote: input.quote,
            status: "open",
            resolvedBy: null,
            resolvedAt: null,
            createdBy: ctx.userId,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        tx.insert(schema.commentMessages)
          .values({
            id: messageId,
            threadId,
            body: input.body,
            authorId: ctx.userId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      });

      publishCommentChanged(ctx, space.id, nodeId);
      return getHydratedThreadOrThrow(nodeId, threadId);
    },

    async replyToThread(ctx, nodeId, threadId, input: ReplyCommentInput) {
      const { space } = await assertNodeAccess(ctx, nodeId, true);
      await getHydratedThreadOrThrow(nodeId, threadId);

      const now = new Date().toISOString();
      const messageId = `msg_${nanoid(12)}`;

      db.transaction((tx) => {
        tx.insert(schema.commentMessages)
          .values({
            id: messageId,
            threadId,
            body: input.body,
            authorId: ctx.userId,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        tx.update(schema.commentThreads)
          .set({ updatedAt: now })
          .where(eq(schema.commentThreads.id, threadId))
          .run();
      });

      publishCommentChanged(ctx, space.id, nodeId);
      return getHydratedThreadOrThrow(nodeId, threadId);
    },

    async updateThread(ctx, nodeId, threadId, input: UpdateCommentThreadInput) {
      const { space } = await assertNodeAccess(ctx, nodeId, true);
      await getHydratedThreadOrThrow(nodeId, threadId);

      const now = new Date().toISOString();
      const updates: Partial<typeof schema.commentThreads.$inferInsert> = {
        updatedAt: now,
      };
      if (input.status !== undefined) {
        updates.status = input.status;
        if (input.status === "resolved") {
          updates.resolvedBy = ctx.userId;
          updates.resolvedAt = now;
        } else {
          updates.resolvedBy = null;
          updates.resolvedAt = null;
        }
      }
      if (input.blockIndex !== undefined) updates.blockIndex = input.blockIndex;
      if (input.blockType !== undefined) updates.blockType = input.blockType;
      if (input.quote !== undefined) updates.quote = input.quote;

      await db
        .update(schema.commentThreads)
        .set(updates)
        .where(and(eq(schema.commentThreads.id, threadId), eq(schema.commentThreads.nodeId, nodeId)));

      publishCommentChanged(ctx, space.id, nodeId);
      return getHydratedThreadOrThrow(nodeId, threadId);
    },

    async updateMessage(ctx, nodeId, threadId, messageId, input: UpdateCommentMessageInput) {
      const { space } = await assertNodeAccess(ctx, nodeId, true);
      await getHydratedThreadOrThrow(nodeId, threadId);

      const rows = await db
        .select()
        .from(schema.commentMessages)
        .where(and(eq(schema.commentMessages.id, messageId), eq(schema.commentMessages.threadId, threadId)))
        .limit(1);

      const message = rows[0];
      if (!message) {
        throw new NotFoundError("Comment message not found");
      }
      if (message.authorId !== ctx.userId && ctx.role !== "owner" && ctx.role !== "admin") {
        throw new ForbiddenError("Cannot edit another user's comment");
      }

      const now = new Date().toISOString();
      await db
        .update(schema.commentMessages)
        .set({ body: input.body, updatedAt: now })
        .where(eq(schema.commentMessages.id, messageId));

      await db
        .update(schema.commentThreads)
        .set({ updatedAt: now })
        .where(eq(schema.commentThreads.id, threadId));

      publishCommentChanged(ctx, space.id, nodeId);
      return getHydratedThreadOrThrow(nodeId, threadId);
    },

    async deleteMessage(ctx, nodeId, threadId, messageId) {
      const { space } = await assertNodeAccess(ctx, nodeId, true);
      await getHydratedThreadOrThrow(nodeId, threadId);

      const rows = await db
        .select()
        .from(schema.commentMessages)
        .where(and(eq(schema.commentMessages.id, messageId), eq(schema.commentMessages.threadId, threadId)))
        .limit(1);

      const message = rows[0];
      if (!message) {
        throw new NotFoundError("Comment message not found");
      }
      if (message.authorId !== ctx.userId && ctx.role !== "owner" && ctx.role !== "admin") {
        throw new ForbiddenError("Cannot delete another user's comment");
      }

      await db.delete(schema.commentMessages).where(eq(schema.commentMessages.id, messageId));

      const remaining = await db
        .select({ id: schema.commentMessages.id })
        .from(schema.commentMessages)
        .where(eq(schema.commentMessages.threadId, threadId))
        .limit(1);

      if (remaining.length === 0) {
        await db.delete(schema.commentThreads).where(eq(schema.commentThreads.id, threadId));
        publishCommentChanged(ctx, space.id, nodeId);
        return { threadDeleted: true, thread: null };
      }

      await db
        .update(schema.commentThreads)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(schema.commentThreads.id, threadId));

      publishCommentChanged(ctx, space.id, nodeId);
      const thread = await getHydratedThreadOrThrow(nodeId, threadId);
      return { threadDeleted: false, thread };
    },

    async deleteThread(ctx, nodeId, threadId) {
      const { space } = await assertNodeAccess(ctx, nodeId, true);
      const thread = await getHydratedThreadOrThrow(nodeId, threadId);
      if (thread.createdBy !== ctx.userId && ctx.role !== "owner" && ctx.role !== "admin") {
        throw new ForbiddenError("Cannot delete another user's comment thread");
      }

      await db
        .delete(schema.commentThreads)
        .where(and(eq(schema.commentThreads.id, threadId), eq(schema.commentThreads.nodeId, nodeId)));

      publishCommentChanged(ctx, space.id, nodeId);
    },
  };
}
