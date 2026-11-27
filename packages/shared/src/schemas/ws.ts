import { z } from "zod";

export const wsServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("node.created"),
    orgId: z.string(),
    spaceId: z.string(),
    nodeId: z.string(),
    parentId: z.string().nullable(),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("node.updated"),
    orgId: z.string(),
    spaceId: z.string(),
    nodeId: z.string(),
    version: z.number().int().positive(),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("node.deleted"),
    orgId: z.string(),
    spaceId: z.string(),
    nodeId: z.string(),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("tree.changed"),
    orgId: z.string(),
    spaceId: z.string(),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("space.changed"),
    orgId: z.string(),
    spaceId: z.string(),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("media.created"),
    orgId: z.string(),
    spaceId: z.string().nullable(),
    mediaId: z.string(),
    actorId: z.string(),
  }),
  z.object({
    type: z.literal("media.deleted"),
    orgId: z.string(),
    spaceId: z.string().nullable(),
    mediaId: z.string(),
    actorId: z.string(),
  }),
]);
export type WsServerEvent = z.infer<typeof wsServerEventSchema>;

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    spaceId: z.string().min(1),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    spaceId: z.string().min(1),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
