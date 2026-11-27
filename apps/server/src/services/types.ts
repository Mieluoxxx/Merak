import type {
  CommentThreadDto,
  CreateCommentThreadInput,
  CreateMcpTokenInput,
  CreateNodeInput,
  CreateSpaceInput,
  McpPermission,
  McpTokenDto,
  MediaDto,
  MediaWithRefsDto,
  MoveNodeInput,
  NodeDetailDto,
  NodeTreeItemDto,
  PatchDocInput,
  ReplyCommentInput,
  SearchResultDto,
  SpaceDto,
  SpaceVisibility,
  UpdateCommentMessageInput,
  UpdateCommentThreadInput,
  UpdateNodeInput,
  UpdateSpaceInput,
  WsServerEvent,
} from "@merak/shared";

export interface AuthContext {
  userId: string;
  orgId: string;
  role: string;
  authType: "session" | "mcp-token";
  tokenScopes?: {
    spaceIds: string[] | "*";
    permission: McpPermission;
  };
}

export interface SpaceService {
  listSpaces(ctx: AuthContext, visibility?: SpaceVisibility): Promise<SpaceDto[]>;
  getSpace(ctx: AuthContext, spaceId: string): Promise<SpaceDto | null>;
  createSpace(ctx: AuthContext, input: CreateSpaceInput): Promise<SpaceDto>;
  updateSpace(ctx: AuthContext, spaceId: string, input: UpdateSpaceInput): Promise<SpaceDto>;
  deleteSpace(ctx: AuthContext, spaceId: string): Promise<void>;
}

export interface NodeService {
  getTree(ctx: AuthContext, spaceId: string): Promise<NodeTreeItemDto[]>;
  getNode(ctx: AuthContext, nodeId: string): Promise<NodeDetailDto | null>;
  createNode(ctx: AuthContext, input: CreateNodeInput): Promise<NodeDetailDto>;
  updateNode(ctx: AuthContext, nodeId: string, input: UpdateNodeInput): Promise<NodeDetailDto>;
  patchDoc(ctx: AuthContext, nodeId: string, input: PatchDocInput): Promise<NodeDetailDto>;
  moveNode(ctx: AuthContext, nodeId: string, input: MoveNodeInput): Promise<NodeDetailDto>;
  softDeleteNode(ctx: AuthContext, nodeId: string): Promise<void>;
  restoreNode(ctx: AuthContext, nodeId: string): Promise<NodeDetailDto>;
  listTrash(ctx: AuthContext, spaceId?: string): Promise<NodeDetailDto[]>;
}

export interface UploadMediaInput {
  spaceId?: string | null;
  filename: string;
  mimeType: string;
  data: Buffer;
  width?: number | null;
  height?: number | null;
}

export interface MediaService {
  uploadMedia(ctx: AuthContext, input: UploadMediaInput): Promise<MediaDto>;
  listMedia(ctx: AuthContext, spaceId?: string | null): Promise<MediaWithRefsDto[]>;
  listOrphans(ctx: AuthContext): Promise<MediaWithRefsDto[]>;
  getMediaMeta(ctx: AuthContext, mediaId: string): Promise<MediaDto | null>;
  readMediaStream(ctx: AuthContext, mediaId: string): Promise<{ meta: MediaDto; data: Buffer } | null>;
  deleteMedia(ctx: AuthContext, mediaId: string): Promise<void>;
  syncRefsForNode(nodeId: string, content: string): Promise<void>;
}

export interface SearchService {
  search(
    ctx: AuthContext,
    query: string,
    opts?: { spaceId?: string; limit?: number },
  ): Promise<SearchResultDto[]>;
  indexNode(node: {
    id: string;
    spaceId: string;
    orgId: string;
    type: string;
    title: string;
    content: string;
  }): void;
  removeNode(nodeId: string): void;
}

export interface McpTokenService {
  listTokens(ctx: AuthContext): Promise<McpTokenDto[]>;
  createToken(
    ctx: AuthContext,
    input: CreateMcpTokenInput,
  ): Promise<{ token: McpTokenDto; rawToken: string }>;
  revokeToken(ctx: AuthContext, tokenId: string): Promise<void>;
  verifyRawToken(rawToken: string): Promise<AuthContext | null>;
}

export interface CommentService {
  listThreads(
    ctx: AuthContext,
    nodeId: string,
    opts?: { includeResolved?: boolean },
  ): Promise<CommentThreadDto[]>;
  createThread(
    ctx: AuthContext,
    nodeId: string,
    input: CreateCommentThreadInput,
  ): Promise<CommentThreadDto>;
  replyToThread(
    ctx: AuthContext,
    nodeId: string,
    threadId: string,
    input: ReplyCommentInput,
  ): Promise<CommentThreadDto>;
  updateThread(
    ctx: AuthContext,
    nodeId: string,
    threadId: string,
    input: UpdateCommentThreadInput,
  ): Promise<CommentThreadDto>;
  updateMessage(
    ctx: AuthContext,
    nodeId: string,
    threadId: string,
    messageId: string,
    input: UpdateCommentMessageInput,
  ): Promise<CommentThreadDto>;
  deleteMessage(
    ctx: AuthContext,
    nodeId: string,
    threadId: string,
    messageId: string,
  ): Promise<{ threadDeleted: boolean; thread: CommentThreadDto | null }>;
  deleteThread(ctx: AuthContext, nodeId: string, threadId: string): Promise<void>;
}

export interface RealtimeBroadcaster {
  publish(event: WsServerEvent): void;
}

export interface AppServices {
  spaces: SpaceService;
  nodes: NodeService;
  comments: CommentService;
  media: MediaService;
  search: SearchService;
  mcpTokens: McpTokenService;
  realtime: RealtimeBroadcaster;
}
