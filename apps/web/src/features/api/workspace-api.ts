import {
  API_ROUTES,
  type CreateMcpTokenInput,
  type CreateNodeInput,
  type CreateSpaceInput,
  type McpTokenDto,
  type MediaDto,
  type MediaWithRefsDto,
  type MoveNodeInput,
  type NodeDetailDto,
  type NodeTreeItemDto,
  type SearchResultDto,
  type SpaceDto,
  type SpaceKind,
  type UpdateNodeInput,
  type UpdateSpaceInput,
} from "@merak/shared";
import { apiFetch } from "../../lib/api.js";

export const workspaceQueryKeys = {
  spaces: (kind?: SpaceKind) => (kind ? (["spaces", kind] as const) : (["spaces"] as const)),
  tree: (spaceId: string) => ["tree", spaceId] as const,
  node: (nodeId: string) => ["node", nodeId] as const,
  media: (filter?: { spaceId?: string | null; orphansOnly?: boolean }) => {
    if (!filter) return ["media"] as const;
    if (filter.orphansOnly) return ["media", "orphans"] as const;
    if (filter.spaceId) return ["media", "space", filter.spaceId] as const;
    return ["media", "all"] as const;
  },
  search: (query: string, spaceId?: string) => ["search", query, spaceId ?? "*"] as const,
  mcpTokens: () => ["mcp-tokens"] as const,
} as const;

export function buildSpacesUrl(kind?: SpaceKind): string {
  if (!kind) return API_ROUTES.spaces;
  const params = new URLSearchParams({ kind });
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

// Spaces
export async function fetchSpaces(kind?: SpaceKind): Promise<SpaceDto[]> {
  return apiFetch<SpaceDto[]>(buildSpacesUrl(kind));
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

export async function updateNode(nodeId: string, input: UpdateNodeInput): Promise<NodeDetailDto> {
  return apiFetch<NodeDetailDto>(API_ROUTES.nodeById(nodeId), {
    method: "PATCH",
    body: JSON.stringify(input),
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
