import { z } from "zod";

export const commentThreadStatusSchema = z.enum(["open", "resolved"]);
export type CommentThreadStatus = z.infer<typeof commentThreadStatusSchema>;

export const commentAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});
export type CommentAuthorDto = z.infer<typeof commentAuthorSchema>;

export const commentMessageDtoSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  body: z.string(),
  author: commentAuthorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CommentMessageDto = z.infer<typeof commentMessageDtoSchema>;

export const commentThreadDtoSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  blockIndex: z.number().int().min(0),
  blockType: z.string(),
  quote: z.string(),
  status: commentThreadStatusSchema,
  resolvedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(commentMessageDtoSchema),
});
export type CommentThreadDto = z.infer<typeof commentThreadDtoSchema>;

export const createCommentThreadInputSchema = z.object({
  blockIndex: z.number().int().min(0),
  blockType: z.string().min(1).max(64),
  quote: z.string().max(400),
  body: z.string().trim().min(1).max(4000),
});
export type CreateCommentThreadInput = z.infer<typeof createCommentThreadInputSchema>;

export const replyCommentInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type ReplyCommentInput = z.infer<typeof replyCommentInputSchema>;

export const updateCommentThreadInputSchema = z.object({
  status: commentThreadStatusSchema.optional(),
  blockIndex: z.number().int().min(0).optional(),
  blockType: z.string().min(1).max(64).optional(),
  quote: z.string().max(400).optional(),
});
export type UpdateCommentThreadInput = z.infer<typeof updateCommentThreadInputSchema>;

export const updateCommentMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type UpdateCommentMessageInput = z.infer<typeof updateCommentMessageInputSchema>;
