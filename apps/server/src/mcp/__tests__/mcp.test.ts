import crypto from "node:crypto";
import {
  API_ROUTES,
  extractCanvasText,
  extractExcalidrawText,
  extractMediaIdsFromContent,
  rankAfter,
  type MediaDto,
  type MediaWithRefsDto,
  type NodeDetailDto,
  type NodeTreeItemDto,
  type SearchResultDto,
  type SpaceDto,
  type SpaceKind,
} from "@merak/shared";
import { UI_SDK_MANIFEST } from "@merak/ui/artifact";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices, AuthContext } from "../../services/types.js";
import { mountMcpRoutes } from "../index.js";

interface MockStore {
  spaces: Map<string, SpaceDto>;
  nodes: Map<string, NodeDetailDto>;
  media: Map<string, { meta: MediaDto; data: Buffer }>;
  tokens: Map<string, AuthContext>;
  mutationCount: number;
}

function createInMemoryServices(): { services: AppServices; store: MockStore } {
  const now = "2026-11-27T10:00:00.000Z";
  let idSeq = 1;
  const nextId = (prefix: string) => `${prefix}-${idSeq++}`;

  const store: MockStore = {
    spaces: new Map<string, SpaceDto>([
      [
        "space-a",
        {
          id: "space-a",
          orgId: "org-1",
          kind: "knowledge",
          slug: "engineering-kb",
          name: "Engineering Knowledge Base",
          icon: "book",
          description: "Core architecture docs",
          sortOrder: "i",
          createdAt: now,
          updatedAt: now,
        },
      ],
      [
        "space-b",
        {
          id: "space-b",
          orgId: "org-1",
          kind: "project",
          slug: "secret-project",
          name: "Secret Project",
          icon: "rocket",
          description: "Restricted project space",
          sortOrder: "r",
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]),
    nodes: new Map<string, NodeDetailDto>([
      [
        "doc-a1",
        {
          id: "doc-a1",
          spaceId: "space-a",
          parentId: null,
          type: "doc",
          title: "Architecture Overview",
          icon: null,
          sortOrder: "h",
          version: 1,
          content: "# Architecture\n\nStatus: draft\nService: Merak API",
          createdAt: now,
          updatedAt: now,
          createdBy: "user-1",
          updatedBy: "user-1",
          deletedAt: null,
        },
      ],
      [
        "doc-a2",
        {
          id: "doc-a2",
          spaceId: "space-a",
          parentId: null,
          type: "doc",
          title: "Runbook",
          icon: null,
          sortOrder: "p",
          version: 1,
          content: "# Runbook\n\nRestart instructions",
          createdAt: now,
          updatedAt: now,
          createdBy: "user-1",
          updatedBy: "user-1",
          deletedAt: null,
        },
      ],
      [
        "doc-a1-child",
        {
          id: "doc-a1-child",
          spaceId: "space-a",
          parentId: "doc-a1",
          type: "doc",
          title: "ADR-001",
          icon: null,
          sortOrder: "i",
          version: 1,
          content: "# ADR-001\n\nUse SQLite WAL mode.",
          createdAt: now,
          updatedAt: now,
          createdBy: "user-1",
          updatedBy: "user-1",
          deletedAt: null,
        },
      ],
      [
        "doc-b1",
        {
          id: "doc-b1",
          spaceId: "space-b",
          parentId: null,
          type: "doc",
          title: "Confidential Launch Plan",
          icon: null,
          sortOrder: "i",
          version: 1,
          content: "# Secret Launch\n\nArchitecture launch notes",
          createdAt: now,
          updatedAt: now,
          createdBy: "user-1",
          updatedBy: "user-1",
          deletedAt: null,
        },
      ],
    ]),
    media: new Map<string, { meta: MediaDto; data: Buffer }>([
      [
        "media-a1",
        {
          meta: {
            id: "media-a1",
            orgId: "org-1",
            spaceId: "space-a",
            sha256: "aaa111",
            filename: "diagram-a.png",
            mimeType: "image/png",
            sizeBytes: 128,
            width: 800,
            height: 600,
            url: "/api/media/media-a1",
            createdBy: "user-1",
            createdAt: now,
          },
          data: Buffer.from("fake-png-a"),
        },
      ],
      [
        "media-b1",
        {
          meta: {
            id: "media-b1",
            orgId: "org-1",
            spaceId: "space-b",
            sha256: "bbb222",
            filename: "secret-b.png",
            mimeType: "image/png",
            sizeBytes: 256,
            width: 400,
            height: 300,
            url: "/api/media/media-b1",
            createdBy: "user-1",
            createdAt: now,
          },
          data: Buffer.from("fake-png-b"),
        },
      ],
    ]),
    tokens: new Map<string, AuthContext>([
      [
        "mrk_admin_write",
        {
          userId: "user-1",
          orgId: "org-1",
          role: "owner",
          authType: "mcp-token",
          tokenScopes: { spaceIds: "*", permission: "write" },
        },
      ],
      [
        "mrk_read_only",
        {
          userId: "user-2",
          orgId: "org-1",
          role: "member",
          authType: "mcp-token",
          tokenScopes: { spaceIds: "*", permission: "read" },
        },
      ],
      [
        "mrk_space_a_write",
        {
          userId: "user-3",
          orgId: "org-1",
          role: "member",
          authType: "mcp-token",
          tokenScopes: { spaceIds: ["space-a"], permission: "write" },
        },
      ],
    ]),
    mutationCount: 0,
  };

  function buildTree(spaceId: string): NodeTreeItemDto[] {
    const spaceNodes = [...store.nodes.values()].filter(
      (node) => node.spaceId === spaceId && node.deletedAt === null,
    );
    const byParent = new Map<string | null, NodeDetailDto[]>();
    for (const node of spaceNodes) {
      const list = byParent.get(node.parentId) ?? [];
      list.push(node);
      byParent.set(node.parentId, list);
    }
    const buildBranch = (parentId: string | null): NodeTreeItemDto[] => {
      const list = (byParent.get(parentId) ?? []).sort((a, b) =>
        a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0,
      );
      return list.map((node) => {
        const children = buildBranch(node.id);
        return {
          id: node.id,
          spaceId: node.spaceId,
          parentId: node.parentId,
          type: node.type,
          title: node.title,
          icon: node.icon,
          sortOrder: node.sortOrder,
          version: node.version,
          updatedAt: node.updatedAt,
          updatedBy: node.updatedBy,
          hasChildren: children.length > 0,
          children,
        };
      });
    };
    return buildBranch(null);
  }

  const services: AppServices = {
    spaces: {
      async listSpaces(_ctx, kind?: SpaceKind) {
        return [...store.spaces.values()].filter((s) => (!kind ? true : s.kind === kind));
      },
      async getSpace(_ctx, spaceId) {
        return store.spaces.get(spaceId) ?? null;
      },
      async createSpace() {
        throw new Error("not implemented in mock");
      },
      async updateSpace() {
        throw new Error("not implemented in mock");
      },
      async deleteSpace() {
        throw new Error("not implemented in mock");
      },
    },
    nodes: {
      async getTree(_ctx, spaceId) {
        return buildTree(spaceId);
      },
      async getNode(_ctx, nodeId) {
        const node = store.nodes.get(nodeId);
        return node && node.deletedAt === null ? { ...node } : null;
      },
      async createNode(ctx, input) {
        store.mutationCount++;
        const siblings = [...store.nodes.values()]
          .filter((n) => n.spaceId === input.spaceId && n.parentId === (input.parentId ?? null))
          .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1));
        const sortOrder = input.sortOrder ?? rankAfter(siblings.at(-1)?.sortOrder ?? null);
        const node: NodeDetailDto = {
          id: nextId("node"),
          spaceId: input.spaceId,
          parentId: input.parentId ?? null,
          type: input.type,
          title: input.title,
          icon: input.icon ?? null,
          sortOrder,
          version: 1,
          content: input.content ?? "",
          createdAt: now,
          updatedAt: now,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
          deletedAt: null,
        };
        store.nodes.set(node.id, node);
        return { ...node };
      },
      async updateNode(ctx, nodeId, input) {
        store.mutationCount++;
        const existing = store.nodes.get(nodeId);
        if (!existing) throw new Error("Node not found");
        if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
          throw new Error(
            `Version conflict: expected ${input.expectedVersion}, actual ${existing.version}`,
          );
        }
        const updated: NodeDetailDto = {
          ...existing,
          title: input.title ?? existing.title,
          icon: input.icon !== undefined ? input.icon : existing.icon,
          content: input.content !== undefined ? input.content : existing.content,
          version: existing.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.userId,
        };
        store.nodes.set(nodeId, updated);
        return { ...updated };
      },
      async patchDoc(ctx, nodeId, input) {
        store.mutationCount++;
        const existing = store.nodes.get(nodeId);
        if (!existing) throw new Error("Node not found");
        if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
          throw new Error(
            `Version conflict: expected ${input.expectedVersion}, actual ${existing.version}`,
          );
        }
        if (!existing.content.includes(input.oldText)) {
          throw new Error(`Text not found in document: "${input.oldText}"`);
        }
        const nextContent = input.replaceAll
          ? existing.content.split(input.oldText).join(input.newText)
          : existing.content.replace(input.oldText, input.newText);
        const updated: NodeDetailDto = {
          ...existing,
          content: nextContent,
          version: existing.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.userId,
        };
        store.nodes.set(nodeId, updated);
        return { ...updated };
      },
      async moveNode(ctx, nodeId, input) {
        store.mutationCount++;
        const existing = store.nodes.get(nodeId);
        if (!existing) throw new Error("Node not found");
        const updated: NodeDetailDto = {
          ...existing,
          parentId: input.parentId,
          sortOrder: input.sortOrder,
          version: existing.version + 1,
          updatedAt: new Date().toISOString(),
          updatedBy: ctx.userId,
        };
        store.nodes.set(nodeId, updated);
        return { ...updated };
      },
      async softDeleteNode() {
        throw new Error("not implemented in mock");
      },
      async restoreNode() {
        throw new Error("not implemented in mock");
      },
      async listTrash() {
        return [];
      },
    },
    media: {
      async uploadMedia(ctx, input) {
        store.mutationCount++;
        const sha256 = crypto.createHash("sha256").update(input.data).digest("hex");
        for (const existing of store.media.values()) {
          if (existing.meta.orgId === ctx.orgId && existing.meta.sha256 === sha256) {
            return { ...existing.meta };
          }
        }
        const id = nextId("media");
        const meta: MediaDto = {
          id,
          orgId: ctx.orgId,
          spaceId: input.spaceId ?? null,
          sha256,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.data.length,
          width: input.width ?? null,
          height: input.height ?? null,
          url: API_ROUTES.mediaById(id),
          createdBy: ctx.userId,
          createdAt: now,
        };
        store.media.set(id, { meta, data: Buffer.from(input.data) });
        return { ...meta };
      },
      async listMedia(_ctx, spaceId) {
        const items: MediaWithRefsDto[] = [];
        for (const { meta } of store.media.values()) {
          if (spaceId && meta.spaceId !== spaceId) continue;
          const refNodeIds = [...store.nodes.values()]
            .filter((n) => extractMediaIdsFromContent(n.content).includes(meta.id))
            .map((n) => n.id);
          items.push({
            ...meta,
            refNodeIds,
            refCount: refNodeIds.length,
          });
        }
        return items;
      },
      async listOrphans() {
        return [];
      },
      async getMediaMeta(_ctx, mediaId) {
        return store.media.get(mediaId)?.meta ?? null;
      },
      async readMediaStream(_ctx, mediaId) {
        return store.media.get(mediaId) ?? null;
      },
      async deleteMedia() {
        throw new Error("not implemented in mock");
      },
      async syncRefsForNode() {
        // no-op
      },
    },
    search: {
      async search(_ctx, query, opts) {
        const q = query.toLowerCase();
        const results: SearchResultDto[] = [];
        for (const node of store.nodes.values()) {
          if (opts?.spaceId && node.spaceId !== opts.spaceId) continue;
          const searchable =
            node.type === "excalidraw"
              ? `${node.title}\n${extractExcalidrawText(node.content)}`
              : node.type === "canvas"
                ? `${node.title}\n${extractCanvasText(node.content)}`
                : `${node.title}\n${node.content}`;
          if (searchable.toLowerCase().includes(q)) {
            results.push({
              nodeId: node.id,
              spaceId: node.spaceId,
              type: node.type,
              title: node.title,
              snippet: searchable.slice(0, 120),
              rank: 1,
            });
          }
        }
        return opts?.limit ? results.slice(0, opts.limit) : results;
      },
      indexNode() {
        // no-op
      },
      removeNode() {
        // no-op
      },
    },
    mcpTokens: {
      async listTokens() {
        return [];
      },
      async createToken() {
        throw new Error("not implemented in mock");
      },
      async revokeToken() {
        throw new Error("not implemented in mock");
      },
      async verifyRawToken(rawToken) {
        return store.tokens.get(rawToken) ?? null;
      },
    },
    realtime: {
      publish() {
        // no-op
      },
    },
  };

  return { services, store };
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

async function rpcRequest(
  app: Hono,
  token: string | null,
  body: Record<string, unknown>,
): Promise<{ status: number; json: JsonRpcResponse; headers: Headers }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token !== null) {
    headers.Authorization = token;
  }

  const res = await app.request(API_ROUTES.mcp, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as JsonRpcResponse;
  return { status: res.status, json, headers: res.headers };
}

interface ParsedToolCall {
  isError: boolean;
  data: Record<string, unknown>;
}

async function callTool(
  app: Hono,
  rawToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ParsedToolCall> {
  const { status, json } = await rpcRequest(app, `Bearer ${rawToken}`, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  expect(status).toBe(200);
  expect(json.error).toBeUndefined();
  const result = json.result as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  };
  expect(result.content.length).toBeGreaterThan(0);
  const text = result.content[0]!.text;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { error: text };
  }
  return { isError: Boolean(result.isError), data };
}

describe("Merak Streamable HTTP MCP Server", () => {
  let app: Hono;
  let store: MockStore;

  beforeEach(() => {
    const setup = createInMemoryServices();
    store = setup.store;
    app = new Hono();
    mountMcpRoutes(app, setup.services);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Auth & HTTP Transport
  // -------------------------------------------------------------------------

  describe("Authentication & Streamable HTTP Transport", () => {
    it("rejects missing, malformed, and invalid Bearer tokens with 401", async () => {
      const missing = await rpcRequest(app, null, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });
      expect(missing.status).toBe(401);
      expect(missing.json.error?.code).toBe(-32001);
      expect(missing.headers.get("www-authenticate")).toContain("Bearer");

      const malformed = await rpcRequest(app, "Basic dXNlcjpwYXNz", {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });
      expect(malformed.status).toBe(401);

      const invalid = await rpcRequest(app, "Bearer mrk_revoked_or_unknown", {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
      });
      expect(invalid.status).toBe(401);
      expect(invalid.json.error?.message).toMatch(/invalid|expired|revoked/i);
    });

    it("handles initialize handshake and rejects stateless GET SSE with 405", async () => {
      const init = await rpcRequest(app, "Bearer mrk_admin_write", {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vitest-client", version: "1.0.0" },
        },
      });
      expect(init.status).toBe(200);
      const initResult = init.json.result as { serverInfo: { name: string } };
      expect(initResult.serverInfo.name).toBe("merak-mcp");

      const getRes = await app.request(API_ROUTES.mcp, {
        method: "GET",
        headers: {
          Authorization: "Bearer mrk_admin_write",
          Accept: "text/event-stream",
        },
      });
      expect(getRes.status).toBe(405);
      expect(getRes.headers.get("allow")).toContain("POST");
    });

    it("works end-to-end with @modelcontextprotocol/sdk Client + StreamableHTTPClientTransport", async () => {
      const client = new Client({ name: "merak-test-sdk-client", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer mrk_space_a_write" },
        },
        fetch: async (input, init) => app.request(input, init),
      });

      await client.connect(transport);
      try {
        const listedTools = await client.listTools();
        expect(listedTools.tools).toHaveLength(14);

        const listedResources = await client.listResources();
        expect(listedResources.resources.some((r) => r.uri === "merak://ui-sdk/manifest")).toBe(
          true,
        );

        const spacesRes = await client.callTool({ name: "list_spaces", arguments: {} });
        const textBlock = (spacesRes.content as Array<{ type: string; text?: string }>)[0];
        const parsed = JSON.parse(textBlock?.text ?? "{}") as { spaces: SpaceDto[] };
        expect(parsed.spaces.map((s) => s.id)).toEqual(["space-a"]);
      } finally {
        await client.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Discovery: Tools & UI SDK Resources
  // -------------------------------------------------------------------------

  describe("Discovery: tools/list, resources/list, resources/read", () => {
    it("lists all 14 Merak MCP tools", async () => {
      const res = await rpcRequest(app, "Bearer mrk_read_only", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });
      expect(res.status).toBe(200);
      const { tools } = res.json.result as { tools: Array<{ name: string }> };
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(
        [
          "create_node",
          "get_tree",
          "get_ui_sdk_manifest",
          "list_media",
          "list_spaces",
          "move_node",
          "patch_doc",
          "publish_html_artifact",
          "read_node",
          "search_workspace",
          "update_node",
          "upload_media",
          "upsert_canvas",
          "upsert_excalidraw",
        ].sort(),
      );
    });

    it("exposes UI_SDK_MANIFEST via resources/list, resources/read, and get_ui_sdk_manifest", async () => {
      const listRes = await rpcRequest(app, "Bearer mrk_read_only", {
        jsonrpc: "2.0",
        id: 1,
        method: "resources/list",
      });
      expect(listRes.status).toBe(200);
      const { resources } = listRes.json.result as {
        resources: Array<{ uri: string; mimeType?: string }>;
      };
      expect(resources.some((r) => r.uri === "merak://ui-sdk/manifest")).toBe(true);

      const readRes = await rpcRequest(app, "Bearer mrk_read_only", {
        jsonrpc: "2.0",
        id: 2,
        method: "resources/read",
        params: { uri: "merak://ui-sdk/manifest" },
      });
      expect(readRes.status).toBe(200);
      const { contents } = readRes.json.result as {
        contents: Array<{ uri: string; mimeType: string; text: string }>;
      };
      expect(contents[0]?.mimeType).toBe("application/json");
      expect(JSON.parse(contents[0]!.text)).toEqual(UI_SDK_MANIFEST);

      const toolRes = await callTool(app, "mrk_read_only", "get_ui_sdk_manifest");
      expect(toolRes.isError).toBe(false);
      expect(toolRes.data.manifest).toEqual(UI_SDK_MANIFEST);
    });
  });

  // -------------------------------------------------------------------------
  // Read-Only Token Scope Enforcement
  // -------------------------------------------------------------------------

  describe("Read-only token scope enforcement", () => {
    it("allows all read/search/discovery tools", async () => {
      const spaces = await callTool(app, "mrk_read_only", "list_spaces");
      expect(spaces.isError).toBe(false);
      expect((spaces.data.spaces as SpaceDto[]).length).toBe(2);

      const kbOnly = await callTool(app, "mrk_read_only", "list_spaces", { kind: "knowledge" });
      expect((kbOnly.data.spaces as SpaceDto[]).map((s) => s.id)).toEqual(["space-a"]);

      const tree = await callTool(app, "mrk_read_only", "get_tree", { spaceId: "space-a" });
      expect(tree.isError).toBe(false);
      expect((tree.data.tree as NodeTreeItemDto[]).length).toBe(2);

      const search = await callTool(app, "mrk_read_only", "search_workspace", {
        query: "Architecture",
      });
      expect(search.isError).toBe(false);
      expect((search.data.results as SearchResultDto[]).length).toBe(2);

      const node = await callTool(app, "mrk_read_only", "read_node", { nodeId: "doc-a1" });
      expect(node.isError).toBe(false);
      expect((node.data.node as NodeDetailDto).id).toBe("doc-a1");

      const media = await callTool(app, "mrk_read_only", "list_media");
      expect(media.isError).toBe(false);
      expect((media.data.media as MediaWithRefsDto[]).length).toBe(2);
    });

    it("rejects every mutating tool cleanly without mutating state", async () => {
      const writeCalls: Array<[string, Record<string, unknown>]> = [
        ["create_node", { spaceId: "space-a", type: "doc", title: "Blocked" }],
        ["update_node", { nodeId: "doc-a1", title: "Blocked" }],
        ["patch_doc", { nodeId: "doc-a1", find: "draft", replace: "published" }],
        ["move_node", { nodeId: "doc-a2", parentId: "doc-a1" }],
        [
          "upsert_excalidraw",
          {
            spaceId: "space-a",
            title: "Blocked Diagram",
            document: { elements: [{ type: "rectangle", x: 0, y: 0 }] },
          },
        ],
        [
          "publish_html_artifact",
          { spaceId: "space-a", title: "Blocked HTML", html: "<h1>No</h1>" },
        ],
        [
          "upsert_canvas",
          {
            spaceId: "space-a",
            title: "Blocked Canvas",
            document: { nodes: [], edges: [] },
          },
        ],
        [
          "upload_media",
          {
            filename: "blocked.png",
            mimeType: "image/png",
            base64Data: Buffer.from("img").toString("base64"),
          },
        ],
      ];

      for (const [toolName, args] of writeCalls) {
        const res = await callTool(app, "mrk_read_only", toolName, args);
        expect(res.isError, `Expected ${toolName} to fail for read-only token`).toBe(true);
        expect(res.data.code).toBe("FORBIDDEN_SCOPE");
      }

      expect(store.mutationCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Space-Scoped Token Enforcement
  // -------------------------------------------------------------------------

  describe("Space-scoped token enforcement (spaceIds: ['space-a'])", () => {
    it("restricts list_spaces, search_workspace, list_media, get_tree, and read_node to space-a", async () => {
      const spaces = await callTool(app, "mrk_space_a_write", "list_spaces");
      expect((spaces.data.spaces as SpaceDto[]).map((s) => s.id)).toEqual(["space-a"]);

      const searchAll = await callTool(app, "mrk_space_a_write", "search_workspace", {
        query: "Architecture",
      });
      expect(searchAll.isError).toBe(false);
      expect((searchAll.data.results as SearchResultDto[]).every((r) => r.spaceId === "space-a")).toBe(
        true,
      );

      const searchForbidden = await callTool(app, "mrk_space_a_write", "search_workspace", {
        query: "Secret",
        spaceId: "space-b",
      });
      expect(searchForbidden.isError).toBe(true);
      expect(searchForbidden.data.code).toBe("FORBIDDEN_SCOPE");

      const treeForbidden = await callTool(app, "mrk_space_a_write", "get_tree", {
        spaceId: "space-b",
      });
      expect(treeForbidden.isError).toBe(true);
      expect(treeForbidden.data.code).toBe("FORBIDDEN_SCOPE");

      const nodeForbidden = await callTool(app, "mrk_space_a_write", "read_node", {
        nodeId: "doc-b1",
      });
      expect(nodeForbidden.isError).toBe(true);
      expect(nodeForbidden.data.code).toBe("FORBIDDEN_SCOPE");

      const mediaList = await callTool(app, "mrk_space_a_write", "list_media");
      expect((mediaList.data.media as MediaWithRefsDto[]).map((m) => m.id)).toEqual(["media-a1"]);
    });

    it("allows writing in space-a and rejects writes targeting space-b", async () => {
      const allowedCreate = await callTool(app, "mrk_space_a_write", "create_node", {
        spaceId: "space-a",
        parentId: "doc-a1",
        type: "doc",
        title: "Allowed Child",
        content: "Hello",
      });
      expect(allowedCreate.isError).toBe(false);
      expect((allowedCreate.data.node as NodeDetailDto).spaceId).toBe("space-a");

      const mutationsBefore = store.mutationCount;

      const blockedCreate = await callTool(app, "mrk_space_a_write", "create_node", {
        spaceId: "space-b",
        type: "doc",
        title: "Unauthorized",
      });
      expect(blockedCreate.isError).toBe(true);
      expect(blockedCreate.data.code).toBe("FORBIDDEN_SCOPE");

      const blockedUpdate = await callTool(app, "mrk_space_a_write", "update_node", {
        nodeId: "doc-b1",
        title: "Hacked",
      });
      expect(blockedUpdate.isError).toBe(true);
      expect(blockedUpdate.data.code).toBe("FORBIDDEN_SCOPE");

      const blockedCanvasCrossRef = await callTool(app, "mrk_space_a_write", "upsert_canvas", {
        spaceId: "space-a",
        title: "Cross-space Canvas",
        document: {
          nodes: [
            {
              id: "c1",
              type: "file",
              file: "secret.md",
              nodeId: "doc-b1",
              x: 0,
              y: 0,
              width: 300,
              height: 200,
            },
          ],
          edges: [],
        },
      });
      expect(blockedCanvasCrossRef.isError).toBe(true);
      expect(blockedCanvasCrossRef.data.code).toBe("FORBIDDEN_SCOPE");

      expect(store.mutationCount).toBe(mutationsBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Tree, Docs & Specialized Guardrail Tools
  // -------------------------------------------------------------------------

  describe("Tree, Docs, and Specialized Guardrail Tools", () => {
    it("patches Markdown docs with patch_doc and enforces expectedVersion", async () => {
      const patched = await callTool(app, "mrk_admin_write", "patch_doc", {
        nodeId: "doc-a1",
        find: "Status: draft",
        replace: "Status: approved",
        expectedVersion: 1,
      });
      expect(patched.isError).toBe(false);
      const node = patched.data.node as NodeDetailDto;
      expect(node.content).toContain("Status: approved");
      expect(node.version).toBe(2);

      const stale = await callTool(app, "mrk_admin_write", "patch_doc", {
        nodeId: "doc-a1",
        find: "Status: approved",
        replace: "Status: archived",
        expectedVersion: 1,
      });
      expect(stale.isError).toBe(true);
      expect(String(stale.data.error)).toMatch(/version conflict/i);
    });

    it("reorders and reparents nodes via move_node and rejects cycles", async () => {
      const movedBefore = await callTool(app, "mrk_admin_write", "move_node", {
        nodeId: "doc-a2",
        parentId: null,
        beforeNodeId: "doc-a1",
      });
      expect(movedBefore.isError).toBe(false);
      const movedNode = movedBefore.data.node as NodeDetailDto;
      expect(movedNode.sortOrder < store.nodes.get("doc-a1")!.sortOrder).toBe(true);

      // Cycle: moving doc-a1 under its own child doc-a1-child must fail.
      const cycle = await callTool(app, "mrk_admin_write", "move_node", {
        nodeId: "doc-a1",
        parentId: "doc-a1-child",
      });
      expect(cycle.isError).toBe(true);
      expect(cycle.data.code).toBe("VALIDATION_ERROR");
    });

    it("normalizes partial LLM Excalidraw elements in upsert_excalidraw", async () => {
      const minimalScene = {
        elements: [
          { id: "box-1", type: "rectangle", x: 80, y: 80 },
          { id: "box-2", type: "rectangle", x: 380, y: 80 },
          {
            type: "arrow",
            x: 260,
            y: 120,
            width: 120,
            height: 0,
            startBinding: { elementId: "box-1" },
            endBinding: { elementId: "missing-id" },
          },
        ],
      };

      const created = await callTool(app, "mrk_admin_write", "upsert_excalidraw", {
        spaceId: "space-a",
        parentId: "doc-a1",
        title: "System Topology",
        document: minimalScene,
      });
      expect(created.isError).toBe(false);
      expect(created.data.elementCount).toBe(3);

      const node = created.data.node as NodeDetailDto;
      expect(node.type).toBe("excalidraw");
      const saved = JSON.parse(node.content) as {
        type: string;
        version: number;
        elements: Array<Record<string, unknown>>;
        appState: Record<string, unknown>;
      };
      expect(saved.type).toBe("excalidraw");
      expect(saved.version).toBe(2);
      expect(saved.elements).toHaveLength(3);
      expect(saved.elements[0]?.seed).toBeTypeOf("number");
      expect(saved.elements[0]?.width).toBe(180);
      // Arrow receives default points, retains valid startBinding, and strips dangling endBinding.
      const arrow = saved.elements[2]!;
      expect(arrow.id).toBeTypeOf("string");
      expect(arrow.points).toEqual([
        [0, 0],
        [120, 0],
      ]);
      expect(arrow.startBinding).toMatchObject({ elementId: "box-1", focus: 0, gap: 4 });
      expect(arrow.endBinding).toBeNull();

      // Update existing node using JSON string document.
      const updated = await callTool(app, "mrk_admin_write", "upsert_excalidraw", {
        nodeId: node.id,
        expectedVersion: node.version,
        document: JSON.stringify({
          elements: [{ type: "text", x: 40, y: 40, text: "Updated Title" }],
        }),
      });
      expect(updated.isError).toBe(false);
      expect(updated.data.elementCount).toBe(1);
      expect((updated.data.node as NodeDetailDto).version).toBe(2);
    });

    it("publishes HTML Artifacts with previewUrl, uiSdkAssets, and base64 warnings", async () => {
      const largeBase64 = "A".repeat(400);
      const html = `<!doctype html><html><head><link rel="stylesheet" href="/ui-sdk/web.css"><link rel="stylesheet" href="/ui-sdk/merak-ui.css"><script src="/ui-sdk/merak-artifact.js"></script></head><body><img src="data:image/png;base64,${largeBase64}" /></body></html>`;

      const res = await callTool(app, "mrk_admin_write", "publish_html_artifact", {
        spaceId: "space-a",
        title: "Dashboard Prototype",
        html,
      });
      expect(res.isError).toBe(false);
      const node = res.data.node as NodeDetailDto;
      expect(node.type).toBe("html");
      expect(res.data.previewUrl).toBe(`/spaces/${node.spaceId}/nodes/${node.id}`);
      expect(res.data.uiSdkAssets).toEqual(UI_SDK_MANIFEST.artifactRuntime.endpoints);
      expect((res.data.warnings as string[]).some((w) => w.includes("upload_media"))).toBe(true);

      const updated = await callTool(app, "mrk_admin_write", "publish_html_artifact", {
        nodeId: node.id,
        expectedVersion: node.version,
        html: '<main class="mk-page"><img src="/api/media/media-a1" /></main>',
      });
      expect(updated.isError).toBe(false);
      expect((updated.data.warnings as string[])).toEqual([]);
      expect((updated.data.node as NodeDetailDto).version).toBe(2);
    });

    it("validates JSON Canvas schema, edge targets, and referenced workspace nodeIds in upsert_canvas", async () => {
      const invalidSchema = await callTool(app, "mrk_admin_write", "upsert_canvas", {
        spaceId: "space-a",
        title: "Bad Canvas",
        document: {
          nodes: [{ id: "n1", type: "text", x: 0, y: 0, width: -10, height: 100, text: "oops" }],
          edges: [],
        },
      });
      expect(invalidSchema.isError).toBe(true);
      expect(invalidSchema.data.code).toBe("VALIDATION_ERROR");

      const missingRefNode = await callTool(app, "mrk_admin_write", "upsert_canvas", {
        spaceId: "space-a",
        title: "Dangling Ref",
        document: {
          nodes: [
            {
              id: "n1",
              type: "file",
              file: "missing.md",
              nodeId: "does-not-exist",
              x: 0,
              y: 0,
              width: 300,
              height: 200,
            },
          ],
          edges: [],
        },
      });
      expect(missingRefNode.isError).toBe(true);
      expect(missingRefNode.data.code).toBe("VALIDATION_ERROR");
      expect(String(missingRefNode.data.error)).toContain("does-not-exist");

      const validCanvas = await callTool(app, "mrk_admin_write", "upsert_canvas", {
        spaceId: "space-a",
        title: "System Board",
        document: {
          nodes: [
            {
              id: "n1",
              type: "file",
              file: "architecture.md",
              nodeId: "doc-a1",
              x: 40,
              y: 40,
              width: 360,
              height: 240,
            },
            {
              id: "n2",
              type: "text",
              text: "Key milestone",
              x: 480,
              y: 40,
              width: 280,
              height: 160,
            },
          ],
          edges: [
            {
              id: "e1",
              fromNode: "n1",
              fromSide: "right",
              toNode: "n2",
              toSide: "left",
              toEnd: "arrow",
            },
          ],
        },
      });
      expect(validCanvas.isError).toBe(false);
      expect(validCanvas.data.nodeCount).toBe(2);
      expect(validCanvas.data.edgeCount).toBe(1);
      expect((validCanvas.data.node as NodeDetailDto).type).toBe("canvas");
    });

    it("uploads media from raw base64, data URIs, and remote sourceUrl returning /api/media/:id", async () => {
      const payload = Buffer.from("png-binary-bytes-1");
      const res1 = await callTool(app, "mrk_admin_write", "upload_media", {
        filename: "hero.png",
        mimeType: "image/png",
        spaceId: "space-a",
        width: 1200,
        height: 630,
        base64Data: payload.toString("base64"),
      });
      expect(res1.isError).toBe(false);
      const media1 = res1.data.media as MediaDto;
      expect(res1.data.url).toBe(`/api/media/${media1.id}`);
      expect(media1.sizeBytes).toBe(payload.length);

      // Data URI infers mimeType automatically.
      const payload2 = Buffer.from("webp-binary-bytes-2");
      const res2 = await callTool(app, "mrk_admin_write", "upload_media", {
        filename: "thumb.webp",
        spaceId: "space-a",
        base64Data: `data:image/webp;base64,${payload2.toString("base64")}`,
      });
      expect(res2.isError).toBe(false);
      const media2 = res2.data.media as MediaDto;
      expect(media2.mimeType).toBe("image/webp");
      expect(res2.data.url).toBe(`/api/media/${media2.id}`);

      // Remote sourceUrl fetch path.
      const remoteBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(remoteBytes, {
          status: 200,
          headers: {
            "content-type": "image/png; charset=binary",
            "content-length": String(remoteBytes.byteLength),
          },
        }),
      );
      const res3 = await callTool(app, "mrk_admin_write", "upload_media", {
        filename: "remote.png",
        spaceId: "space-a",
        sourceUrl: "https://example.com/assets/remote.png",
      });
      expect(res3.isError).toBe(false);
      const media3 = res3.data.media as MediaDto;
      expect(media3.mimeType).toBe("image/png");
      expect(media3.sizeBytes).toBe(remoteBytes.byteLength);
      expect(res3.data.url).toBe(`/api/media/${media3.id}`);

      // Reject providing neither base64Data nor sourceUrl.
      const invalid = await callTool(app, "mrk_admin_write", "upload_media", {
        filename: "empty.png",
        mimeType: "image/png",
      });
      expect(invalid.isError).toBe(true);
      expect(invalid.data.code).toBe("VALIDATION_ERROR");
    });
  });
});
