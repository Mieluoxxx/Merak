import { z } from "zod";

export const mcpPermissionSchema = z.enum(["read", "write"]);
export type McpPermission = z.infer<typeof mcpPermissionSchema>;

export const mcpTokenScopeSchema = z.object({
  spaceIds: z.union([z.literal("*"), z.array(z.string().min(1)).min(1)]),
  permission: mcpPermissionSchema,
});
export type McpTokenScope = z.infer<typeof mcpTokenScopeSchema>;

export const mcpTokenDtoSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  userId: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: mcpTokenScopeSchema,
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type McpTokenDto = z.infer<typeof mcpTokenDtoSchema>;

export const createMcpTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: mcpTokenScopeSchema,
  expiresAt: z.string().datetime().nullable().optional(),
});
export type CreateMcpTokenInput = z.infer<typeof createMcpTokenInputSchema>;
