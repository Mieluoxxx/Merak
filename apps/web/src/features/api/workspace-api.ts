import {
  API_ROUTES,
  type CommentThreadDto,
  type CreateCommentThreadInput,
  type CreateMcpTokenInput,
  type CreateNodeInput,
  type CreateSpaceInput,
  type McpTokenDto,
  type MediaDto,
  type MediaWithRefsDto,
  type MoveNodeInput,
  type NodeDetailDto,
  type NodeTreeItemDto,
  type ReplyCommentInput,
  type SearchResultDto,
  type SpaceDto,
  type SpaceVisibility,
  type UpdateCommentMessageInput,
  type UpdateCommentThreadInput,
  type UpdateNodeInput,
  type UpdateSpaceInput,
} from "@merak/shared";
import { apiFetch } from "../../lib/api.js";

export const workspaceQueryKeys = {
  spaces: (visibility?: SpaceVisibility) =>
    visibility ? (["spaces", visibility] as const) : (["spaces"] as const),
  tree: (spaceId: string) => ["tree", spaceId] as const,
  node: (nodeId: string) => ["node", nodeId] as const,
  comments: (nodeId: string) => ["comments", nodeId] as const,
  media: (filter?: { spaceId?: string | null; orphansOnly?: boolean }) => {
    if (!filter) return ["media"] as const;
    if (filter.orphansOnly) return ["media", "orphans"] as const;
    if (filter.spaceId) return ["media", "space", filter.spaceId] as const;
    return ["media", "all"] as const;
  },
  search: (query: string, spaceId?: string) => ["search", query, spaceId ?? "*"] as const,
  mcpTokens: () => ["mcp-tokens"] as const,
} as const;

export function buildSpacesUrl(visibility?: SpaceVisibility): string {
  if (!visibility) return API_ROUTES.spaces;
  const params = new URLSearchParams({ visibility });
  return `${API_ROUTES.spaces}?${params.toString()}`;
}

export function buildMediaListUrl(opts?: { spaceId?: string | null; orphansOnly?: boolean }): string {
  if (opts?.orphansOnly) {
    return API_ROUTES.mediaOrphans;
  }
  if (opts?.spaceId) {
    const params = new URLSearchParams({ spaceId: opts.spaceId });
    return `${API_ROUTES.media}?${params.toString()}`;
  }
  return API_ROUTES.media;
}

export function buildSearchUrl(query: string, opts?: { spaceId?: string; limit?: number }): string {
  const params = new URLSearchParams({ q: query });
  if (opts?.spaceId) params.set("spaceId", opts.spaceId);
  if (opts?.limit) params.set("limit", String(opts.limit));
  return `${API_ROUTES.search}?${params.toString()}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  const formatted = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[unitIdx]}`;
}

export function shortHash(sha256: string, length = 8): string {
  return sha256.slice(0, length);
}

// Projects (Spaces)
export async function fetchSpaces(visibility?: SpaceVisibility): Promise<SpaceDto[]> {
  return apiFetch<SpaceDto[]>(buildSpacesUrl(visibility));
}

export async function createSpace(input: CreateSpaceInput): Promise<SpaceDto> {
  return apiFetch<SpaceDto>(API_ROUTES.spaces, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSpace(spaceId: string, input: UpdateSpaceInput): Promise<SpaceDto> {
  return apiFetch<SpaceDto>(API_ROUTES.spaceById(spaceId), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteSpace(spaceId: string): Promise<void> {
  await apiFetch<unknown>(API_ROUTES.spaceById(spaceId), {
    method: "DELETE",
  });
}

// Nodes & Tree
export async function fetchSpaceTree(spaceId: string): Promise<NodeTreeItemDto[]> {
  return apiFetch<NodeTreeItemDto[]>(API_ROUTES.spaceTree(spaceId));
}

export async function fetchNode(nodeId: string): Promise<NodeDetailDto> {
  return apiFetch<NodeDetailDto>(API_ROUTES.nodeById(nodeId));
}

export async function createNode(input: CreateNodeInput): Promise<NodeDetailDto> {
  return apiFetch<NodeDetailDto>(API_ROUTES.nodes, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateNode(
  nodeId: string,
  input: UpdateNodeInput,
  options?: { keepalive?: boolean },
): Promise<NodeDetailDto> {
  return apiFetch<NodeDetailDto>(API_ROUTES.nodeById(nodeId), {
    method: "PATCH",
    body: JSON.stringify(input),
    keepalive: options?.keepalive,
  });
}

export async function moveNode(nodeId: string, input: MoveNodeInput): Promise<NodeDetailDto> {
  return apiFetch<NodeDetailDto>(API_ROUTES.nodeMove(nodeId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteNode(nodeId: string): Promise<void> {
  await apiFetch<unknown>(API_ROUTES.nodeById(nodeId), {
    method: "DELETE",
  });
}

// Media
export async function fetchMediaList(opts?: {
  spaceId?: string | null;
  orphansOnly?: boolean;
}): Promise<MediaWithRefsDto[]> {
  return apiFetch<MediaWithRefsDto[]>(buildMediaListUrl(opts));
}

export async function uploadMediaFile(
  file: File,
  opts?: { spaceId?: string | null },
): Promise<MediaDto> {
  const formData = new FormData();
  formData.append("file", file);
  if (opts?.spaceId) {
    formData.append("spaceId", opts.spaceId);
  }
  return apiFetch<MediaDto>(API_ROUTES.media, {
    method: "POST",
    body: formData,
  });
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await apiFetch<unknown>(API_ROUTES.mediaById(mediaId), {
    method: "DELETE",
  });
}

// Search
export async function searchWorkspace(
  query: string,
  opts?: { spaceId?: string; limit?: number },
): Promise<SearchResultDto[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return apiFetch<SearchResultDto[]>(buildSearchUrl(trimmed, opts));
}

// MCP Tokens
export interface CreatedMcpTokenResponse {
  token: McpTokenDto;
  rawToken: string;
}

export async function fetchMcpTokens(): Promise<McpTokenDto[]> {
  return apiFetch<McpTokenDto[]>(API_ROUTES.mcpTokens);
}

export async function createMcpToken(input: CreateMcpTokenInput): Promise<CreatedMcpTokenResponse> {
  return apiFetch<CreatedMcpTokenResponse>(API_ROUTES.mcpTokens, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeMcpToken(tokenId: string): Promise<void> {
  await apiFetch<unknown>(API_ROUTES.mcpTokenById(tokenId), {
    method: "DELETE",
  });
}

// Block Comments
export async function fetchNodeComments(
  nodeId: string,
  opts?: { includeResolved?: boolean },
): Promise<CommentThreadDto[]> {
  const query = opts?.includeResolved ? "?includeResolved=true" : "";
  return apiFetch<CommentThreadDto[]>(`${API_ROUTES.nodeComments(nodeId)}${query}`);
}

export async function createCommentThread(
  nodeId: string,
  input: CreateCommentThreadInput,
): Promise<CommentThreadDto> {
  return apiFetch<CommentThreadDto>(API_ROUTES.nodeComments(nodeId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function replyCommentThread(
  nodeId: string,
  threadId: string,
  input: ReplyCommentInput,
): Promise<CommentThreadDto> {
  return apiFetch<CommentThreadDto>(API_ROUTES.nodeCommentReplies(nodeId, threadId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCommentThread(
  nodeId: string,
  threadId: string,
  input: UpdateCommentThreadInput,
): Promise<CommentThreadDto> {
  return apiFetch<CommentThreadDto>(API_ROUTES.nodeCommentThread(nodeId, threadId), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateCommentMessage(
  nodeId: string,
  threadId: string,
  messageId: string,
  input: UpdateCommentMessageInput,
): Promise<CommentThreadDto> {
  return apiFetch<CommentThreadDto>(
    API_ROUTES.nodeCommentMessage(nodeId, threadId, messageId),
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteCommentMessage(
  nodeId: string,
  threadId: string,
  messageId: string,
): Promise<{ threadDeleted: boolean; thread: CommentThreadDto | null }> {
  return apiFetch<{ threadDeleted: boolean; thread: CommentThreadDto | null }>(
    API_ROUTES.nodeCommentMessage(nodeId, threadId, messageId),
    {
      method: "DELETE",
    },
  );
}

export async function deleteCommentThread(nodeId: string, threadId: string): Promise<void> {
  await apiFetch<unknown>(API_ROUTES.nodeCommentThread(nodeId, threadId), {
    method: "DELETE",
  });
}
