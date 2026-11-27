import {
  API_ROUTES,
  createCommentThreadInputSchema,
  createNodeInputSchema,
  moveNodeInputSchema,
  patchDocInputSchema,
  replyCommentInputSchema,
  updateCommentMessageInputSchema,
  updateCommentThreadInputSchema,
  updateNodeInputSchema,
} from "@merak/shared";
import type { Hono } from "hono";
import { getAuthContext } from "../auth/middleware.js";
import { NotFoundError } from "../services/errors.js";
import type { AppServices } from "../services/types.js";
import { parseJsonBody } from "./validation.js";

export function mountNodeRoutes(
  app: Hono<any, any, any>,
  services: AppServices,
): void {
  // Register /api/nodes/trash BEFORE /api/nodes/:nodeId so "trash" is not matched as a nodeId.
  app.get(`${API_ROUTES.nodes}/trash`, async (c) => {
    const ctx = getAuthContext(c);
    const spaceId = c.req.query("spaceId") || undefined;
    const trashed = await services.nodes.listTrash(ctx, spaceId);
    return c.json(trashed);
  });

  app.post(API_ROUTES.nodes, async (c) => {
    const ctx = getAuthContext(c);
    const input = await parseJsonBody(c, createNodeInputSchema);
    const created = await services.nodes.createNode(ctx, input);
    return c.json(created, 201);
  });

  app.get(`${API_ROUTES.nodes}/:nodeId`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const node = await services.nodes.getNode(ctx, nodeId);
    if (!node) {
      throw new NotFoundError("Node not found");
    }
    return c.json(node);
  });

  app.patch(`${API_ROUTES.nodes}/:nodeId`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const input = await parseJsonBody(c, updateNodeInputSchema);
    const updated = await services.nodes.updateNode(ctx, nodeId, input);
    return c.json(updated);
  });

  app.delete(`${API_ROUTES.nodes}/:nodeId`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    await services.nodes.softDeleteNode(ctx, nodeId);
    return c.body(null, 204);
  });

  app.post(`${API_ROUTES.nodes}/:nodeId/patch`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const input = await parseJsonBody(c, patchDocInputSchema);
    const updated = await services.nodes.patchDoc(ctx, nodeId, input);
    return c.json(updated);
  });

  app.post(`${API_ROUTES.nodes}/:nodeId/move`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const input = await parseJsonBody(c, moveNodeInputSchema);
    const moved = await services.nodes.moveNode(ctx, nodeId, input);
    return c.json(moved);
  });

  app.post(`${API_ROUTES.nodes}/:nodeId/restore`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const restored = await services.nodes.restoreNode(ctx, nodeId);
    return c.json(restored);
  });

  app.get(`${API_ROUTES.nodes}/:nodeId/comments`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const includeResolved = c.req.query("includeResolved") === "true";
    const threads = await services.comments.listThreads(ctx, nodeId, { includeResolved });
    return c.json(threads);
  });

  app.post(`${API_ROUTES.nodes}/:nodeId/comments`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const input = await parseJsonBody(c, createCommentThreadInputSchema);
    const created = await services.comments.createThread(ctx, nodeId, input);
    return c.json(created, 201);
  });

  app.patch(`${API_ROUTES.nodes}/:nodeId/comments/:threadId`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const threadId = c.req.param("threadId");
    const input = await parseJsonBody(c, updateCommentThreadInputSchema);
    const updated = await services.comments.updateThread(ctx, nodeId, threadId, input);
    return c.json(updated);
  });

  app.delete(`${API_ROUTES.nodes}/:nodeId/comments/:threadId`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const threadId = c.req.param("threadId");
    await services.comments.deleteThread(ctx, nodeId, threadId);
    return c.body(null, 204);
  });

  app.post(`${API_ROUTES.nodes}/:nodeId/comments/:threadId/messages`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const threadId = c.req.param("threadId");
    const input = await parseJsonBody(c, replyCommentInputSchema);
    const updated = await services.comments.replyToThread(ctx, nodeId, threadId, input);
    return c.json(updated, 201);
  });

  app.patch(`${API_ROUTES.nodes}/:nodeId/comments/:threadId/messages/:messageId`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const threadId = c.req.param("threadId");
    const messageId = c.req.param("messageId");
    const input = await parseJsonBody(c, updateCommentMessageInputSchema);
    const updated = await services.comments.updateMessage(
      ctx,
      nodeId,
      threadId,
      messageId,
      input,
    );
    return c.json(updated);
  });

  app.delete(`${API_ROUTES.nodes}/:nodeId/comments/:threadId/messages/:messageId`, async (c) => {
    const ctx = getAuthContext(c);
    const nodeId = c.req.param("nodeId");
    const threadId = c.req.param("threadId");
    const messageId = c.req.param("messageId");
    const result = await services.comments.deleteMessage(ctx, nodeId, threadId, messageId);
    return c.json(result);
  });
}
