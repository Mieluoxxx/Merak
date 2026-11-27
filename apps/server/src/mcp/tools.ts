import {
  API_ROUTES,
  jsonCanvasDocumentSchema,
  nodeTypeSchema,
  normalizeExcalidrawDocument,
  rankAfter,
  rankBefore,
  rankBetween,
  spaceKindSchema,
  type NodeDetailDto,
  type NodeTreeItemDto,
} from "@merak/shared";
import { UI_SDK_MANIFEST } from "@merak/ui/artifact";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError, z } from "zod";
import type { AppServices, AuthContext } from "../services/types.js";
import { UI_SDK_CSS_RESOURCE_URI, UI_SDK_MANIFEST_RESOURCE_URI } from "./resources.js";
import {
  McpNotFoundError,
  McpToolError,
  McpValidationError,
  assertSpaceAccess,
  assertWritePermission,
  filterBySpaceScope,
  filterSpacesByScope,
  isSpaceAllowed,
} from "./scopes.js";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MiB
const MIME_TYPE_REGEX = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;
const DATA_URI_BASE64_REGEX = /^data:([^;,]+);base64,([\s\S]+)$/i;
const INLINE_BASE64_DATA_URI_REGEX =
  /data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=\s]{256,}/gi;
const BASE64_PAYLOAD_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

function toolSuccess(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function toolError(err: unknown): CallToolResult {
  if (err instanceof McpToolError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: err.message, code: err.code }, null, 2),
        },
      ],
    };
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: `Validation failed: ${details.join("; ")}`,
              code: "VALIDATION_ERROR",
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, code: "INTERNAL_ERROR" }, null, 2),
      },
    ],
  };
}

async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await fn();
    return toolSuccess(result);
  } catch (err) {
    return toolError(err);
  }
}

function parseJsonDocument(
  raw: string | Record<string, unknown>,
  label: string,
): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new McpValidationError(`${label} must be a JSON object.`);
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof McpValidationError) throw err;
      throw new McpValidationError(
        `${label} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return raw;
}

function compareSortOrder(a: NodeTreeItemDto, b: NodeTreeItemDto): number {
  if (a.sortOrder < b.sortOrder) return -1;
  if (a.sortOrder > b.sortOrder) return 1;
  return a.id.localeCompare(b.id);
}

function findNodeInTree(tree: NodeTreeItemDto[], targetId: string): NodeTreeItemDto | null {
  for (const item of tree) {
    if (item.id === targetId) return item;
    if (item.children.length > 0) {
      const found = findNodeInTree(item.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

function isDescendantInTree(node: NodeTreeItemDto, possibleDescendantId: string): boolean {
  for (const child of node.children) {
    if (child.id === possibleDescendantId) return true;
    if (isDescendantInTree(child, possibleDescendantId)) return true;
  }
  return false;
}

function getSiblingsForParent(
  tree: NodeTreeItemDto[],
  parentId: string | null,
  excludeNodeId: string,
): NodeTreeItemDto[] {
  if (parentId === null) {
    return tree.filter((item) => item.id !== excludeNodeId).sort(compareSortOrder);
  }
  const parent = findNodeInTree(tree, parentId);
  if (!parent) {
    return [];
  }
  return parent.children.filter((item) => item.id !== excludeNodeId).sort(compareSortOrder);
}

async function verifyParentNode(
  services: AppServices,
  ctx: AuthContext,
  spaceId: string,
  parentId: string | null | undefined,
  toolName: string,
): Promise<void> {
  if (!parentId) return;
  const parent = await services.nodes.getNode(ctx, parentId);
  if (!parent) {
    throw new McpNotFoundError(`Parent node "${parentId}" not found.`);
  }
  assertSpaceAccess(ctx, parent.spaceId, toolName);
  if (parent.spaceId !== spaceId) {
    throw new McpValidationError(
      `Parent node "${parentId}" belongs to space "${parent.spaceId}", not "${spaceId}".`,
    );
  }
}

async function upsertTypedNode(
  services: AppServices,
  ctx: AuthContext,
  toolName: string,
  expectedType: "excalidraw" | "html" | "canvas",
  args: {
    nodeId?: string;
    spaceId?: string;
    parentId?: string | null;
    title?: string;
    icon?: string | null;
    expectedVersion?: number;
  },
  content: string,
): Promise<NodeDetailDto> {
  if (args.nodeId) {
    const existing = await services.nodes.getNode(ctx, args.nodeId);
    if (!existing) {
      throw new McpNotFoundError(`Node "${args.nodeId}" not found.`);
    }
    assertSpaceAccess(ctx, existing.spaceId, toolName);
    if (existing.type !== expectedType) {
      throw new McpValidationError(
        `Node "${args.nodeId}" has type "${existing.type}", expected "${expectedType}".`,
      );
    }
    return services.nodes.updateNode(ctx, args.nodeId, {
      title: args.title,
      icon: args.icon,
      content,
      expectedVersion: args.expectedVersion,
    });
  }

  if (!args.spaceId) {
    throw new McpValidationError(
      `Either "nodeId" (to update an existing node) or "spaceId" + "title" (to create a new node) must be provided.`,
    );
  }
  if (!args.title) {
    throw new McpValidationError(`"title" is required when creating a new "${expectedType}" node.`);
  }

  assertSpaceAccess(ctx, args.spaceId, toolName);
  await verifyParentNode(services, ctx, args.spaceId, args.parentId, toolName);

  return services.nodes.createNode(ctx, {
    spaceId: args.spaceId,
    parentId: args.parentId ?? null,
    type: expectedType,
    title: args.title,
    icon: args.icon ?? null,
    content,
  });
}

function decodeBase64Payload(
  rawInput: string,
  explicitMimeType?: string,
): { buffer: Buffer; mimeType: string } {
  let payload = rawInput.trim();
  let inferredMimeType: string | undefined;

  const dataUriMatch = DATA_URI_BASE64_REGEX.exec(payload);
  if (dataUriMatch) {
    inferredMimeType = dataUriMatch[1]?.trim();
    payload = dataUriMatch[2] ?? "";
  }

  const cleanBase64 = payload.replace(/\s+/g, "");
  if (
    cleanBase64.length === 0 ||
    cleanBase64.length % 4 !== 0 ||
    !BASE64_PAYLOAD_REGEX.test(cleanBase64)
  ) {
    throw new McpValidationError("Invalid base64Data payload.");
  }

  const buffer = Buffer.from(cleanBase64, "base64");
  if (buffer.length === 0) {
    throw new McpValidationError("Decoded media payload is empty.");
  }
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new McpValidationError(
      `Media payload exceeds maximum allowed size of ${MAX_MEDIA_BYTES} bytes.`,
    );
  }

  const mimeType = (explicitMimeType ?? inferredMimeType ?? "").trim();
  if (!mimeType || !MIME_TYPE_REGEX.test(mimeType)) {
    throw new McpValidationError(
      `Valid "mimeType" is required (e.g. "image/png"), received "${mimeType || "(empty)"}".`,
    );
  }

  return { buffer, mimeType };
}

async function fetchRemoteMedia(
  sourceUrl: string,
  explicitMimeType?: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new McpValidationError(`Invalid sourceUrl: "${sourceUrl}".`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new McpValidationError(
      `Unsupported sourceUrl protocol "${parsedUrl.protocol}". Only http: and https: are allowed.`,
    );
  }

  const response = await fetch(parsedUrl.toString(), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new McpValidationError(
      `Failed to fetch sourceUrl "${sourceUrl}": HTTP ${response.status} ${response.statusText}.`,
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_MEDIA_BYTES) {
      throw new McpValidationError(
        `Remote media exceeds maximum allowed size of ${MAX_MEDIA_BYTES} bytes.`,
      );
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new McpValidationError("Remote media payload is empty.");
  }
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new McpValidationError(
      `Remote media exceeds maximum allowed size of ${MAX_MEDIA_BYTES} bytes.`,
    );
  }

  const headerMime = response.headers.get("content-type")?.split(";")[0]?.trim();
  const mimeType = (explicitMimeType ?? headerMime ?? "").trim();
  if (!mimeType || !MIME_TYPE_REGEX.test(mimeType)) {
    throw new McpValidationError(
      `Could not determine a valid MIME type for sourceUrl "${sourceUrl}". Provide "mimeType" explicitly.`,
    );
  }

  return { buffer, mimeType };
}

function detectHtmlWarnings(html: string): string[] {
  const warnings: string[] = [];
  const base64Matches = html.match(INLINE_BASE64_DATA_URI_REGEX);
  if (base64Matches && base64Matches.length > 0) {
    warnings.push(
      `Detected ${base64Matches.length} inline base64 data URI(s) in HTML content. Upload assets with "upload_media" and reference "/api/media/<id>" instead of embedding base64 payloads.`,
    );
  }
  if (/\b(localStorage|sessionStorage|document\.cookie)\b/.test(html)) {
    warnings.push(
      'Detected browser storage API usage (localStorage/sessionStorage/document.cookie). Merak renders HTML Artifacts inside sandbox="allow-scripts" without allow-same-origin, so persistent storage APIs will throw SecurityError.',
    );
  }
  return warnings;
}

function detectExcalidrawWarnings(files: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  let inlineBase64Files = 0;
  for (const entry of Object.values(files)) {
    if (entry && typeof entry === "object" && "dataURL" in entry) {
      const dataUrl = (entry as { dataURL?: unknown }).dataURL;
      if (typeof dataUrl === "string" && /^data:[^;]+;base64,/i.test(dataUrl) && dataUrl.length > 256) {
        inlineBase64Files++;
      }
    }
  }
  if (inlineBase64Files > 0) {
    warnings.push(
      `Detected ${inlineBase64Files} inline base64 file(s) in Excalidraw "files". Prefer uploading images via "upload_media" and referencing "/api/media/<id>".`,
    );
  }
  return warnings;
}

/**
 * Registers all Zod-validated Merak MCP tools on the given McpServer, bound to
 * the authenticated caller's AuthContext and AppServices.
 */
export function registerMcpTools(
  server: McpServer,
  services: AppServices,
  ctx: AuthContext,
): void {
  // ---------------------------------------------------------------------------
  // Read / Search / Discovery Tools
  // ---------------------------------------------------------------------------

  server.registerTool(
    "list_spaces",
    {
      title: "List Spaces",
      description:
        'List accessible Knowledge Base ("knowledge") and Project ("project") spaces within the token scope.',
      inputSchema: {
        kind: spaceKindSchema.optional().describe('Optional filter by space kind ("knowledge" or "project").'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ kind }) =>
      runTool(async () => {
        const allSpaces = await services.spaces.listSpaces(ctx, kind);
        const spaces = filterSpacesByScope(ctx, allSpaces);
        return { spaces };
      }),
  );

  server.registerTool(
    "get_tree",
    {
      title: "Get Space Node Tree",
      description: "Retrieve the hierarchical node tree for a space.",
      inputSchema: {
        spaceId: z.string().min(1).describe("Target space ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ spaceId }) =>
      runTool(async () => {
        assertSpaceAccess(ctx, spaceId, "get_tree");
        const tree = await services.nodes.getTree(ctx, spaceId);
        return { spaceId, tree };
      }),
  );

  server.registerTool(
    "search_workspace",
    {
      title: "Search Workspace",
      description: "Full-text search across docs, Excalidraw text, HTML artifacts, and Canvas nodes.",
      inputSchema: {
        query: z.string().trim().min(1).describe("Full-text search query."),
        spaceId: z.string().min(1).optional().describe("Optional space ID to restrict search results."),
        limit: z.number().int().min(1).max(100).optional().describe("Maximum results to return (1-100)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ query, spaceId, limit }) =>
      runTool(async () => {
        if (spaceId) {
          assertSpaceAccess(ctx, spaceId, "search_workspace");
        }
        const rawResults = await services.search.search(ctx, query, { spaceId, limit });
        const results = rawResults.filter((item) => isSpaceAllowed(ctx, item.spaceId));
        return { query, results };
      }),
  );

  server.registerTool(
    "read_node",
    {
      title: "Read Node",
      description: "Read full details and content of a workspace node by nodeId.",
      inputSchema: {
        nodeId: z.string().min(1).describe("Target node ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ nodeId }) =>
      runTool(async () => {
        const node = await services.nodes.getNode(ctx, nodeId);
        if (!node) {
          throw new McpNotFoundError(`Node "${nodeId}" not found.`);
        }
        assertSpaceAccess(ctx, node.spaceId, "read_node");
        return { node };
      }),
  );

  server.registerTool(
    "list_media",
    {
      title: "List Media Gallery",
      description: "List uploaded media items along with their reference counts and referencing node IDs.",
      inputSchema: {
        spaceId: z.string().min(1).optional().describe("Optional space ID filter."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ spaceId }) =>
      runTool(async () => {
        if (spaceId) {
          assertSpaceAccess(ctx, spaceId, "list_media");
        }
        const rawMedia = await services.media.listMedia(ctx, spaceId);
        const media = filterBySpaceScope(ctx, rawMedia, { allowNullSpace: true });
        return { media };
      }),
  );

  server.registerTool(
    "get_ui_sdk_manifest",
    {
      title: "Get Merak UI SDK Manifest",
      description:
        "Return the @merak/ui SDK manifest including /ui-sdk/* artifact endpoints, .mk-* CSS classes, design tokens, and postMessage theme/console protocol.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () =>
      runTool(async () => ({
        manifest: UI_SDK_MANIFEST,
        resourceUri: UI_SDK_MANIFEST_RESOURCE_URI,
        cssResourceUri: UI_SDK_CSS_RESOURCE_URI,
      })),
  );

  // ---------------------------------------------------------------------------
  // Tree / Document Mutation Tools (write scope required)
  // ---------------------------------------------------------------------------

  server.registerTool(
    "create_node",
    {
      title: "Create Node",
      description:
        'Create a new node ("doc", "excalidraw", "html", or "canvas") in a space, optionally nested under parentId.',
      inputSchema: {
        spaceId: z.string().min(1).describe("Target space ID."),
        parentId: z.string().min(1).nullable().optional().describe("Optional parent node ID for nesting."),
        type: nodeTypeSchema.describe('Node type: "doc", "excalidraw", "html", or "canvas".'),
        title: z.string().trim().min(1).max(200).describe("Node title."),
        icon: z.string().trim().max(64).nullable().optional().describe("Optional emoji or icon identifier."),
        content: z.string().optional().describe("Optional initial content string."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ spaceId, parentId, type, title, icon, content }) =>
      runTool(async () => {
        assertWritePermission(ctx, "create_node");
        assertSpaceAccess(ctx, spaceId, "create_node");
        await verifyParentNode(services, ctx, spaceId, parentId, "create_node");
        const node = await services.nodes.createNode(ctx, {
          spaceId,
          parentId: parentId ?? null,
          type,
          title,
          icon: icon ?? null,
          content,
        });
        return { node };
      }),
  );

  server.registerTool(
    "update_node",
    {
      title: "Update Node",
      description:
        "Update a node's title, icon, or full content. Supports expectedVersion for optimistic concurrency control.",
      inputSchema: {
        nodeId: z.string().min(1).describe("Target node ID."),
        title: z.string().trim().min(1).max(200).optional().describe("Updated title."),
        icon: z.string().trim().max(64).nullable().optional().describe("Updated icon (or null to clear)."),
        content: z.string().optional().describe("Full replacement content."),
        expectedVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional optimistic concurrency version."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ nodeId, title, icon, content, expectedVersion }) =>
      runTool(async () => {
        assertWritePermission(ctx, "update_node");
        const existing = await services.nodes.getNode(ctx, nodeId);
        if (!existing) {
          throw new McpNotFoundError(`Node "${nodeId}" not found.`);
        }
        assertSpaceAccess(ctx, existing.spaceId, "update_node");
        const node = await services.nodes.updateNode(ctx, nodeId, {
          title,
          icon,
          content,
          expectedVersion,
        });
        return { node };
      }),
  );

  server.registerTool(
    "patch_doc",
    {
      title: "Patch Markdown Document",
      description:
        "Apply a targeted find-and-replace patch to a Markdown doc node without rewriting the entire document.",
      inputSchema: {
        nodeId: z.string().min(1).describe("Target doc node ID."),
        find: z.string().min(1).describe("Exact substring to find in the document."),
        replace: z.string().describe("Replacement text."),
        replaceAll: z
          .boolean()
          .optional()
          .describe("When true, replace all occurrences of find; otherwise replace the single match."),
        expectedVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional optimistic concurrency version."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ nodeId, find, replace, replaceAll, expectedVersion }) =>
      runTool(async () => {
        assertWritePermission(ctx, "patch_doc");
        const existing = await services.nodes.getNode(ctx, nodeId);
        if (!existing) {
          throw new McpNotFoundError(`Node "${nodeId}" not found.`);
        }
        assertSpaceAccess(ctx, existing.spaceId, "patch_doc");
        if (existing.type !== "doc") {
          throw new McpValidationError(
            `Node "${nodeId}" has type "${existing.type}"; "patch_doc" only supports "doc" nodes.`,
          );
        }
        const node = await services.nodes.patchDoc(ctx, nodeId, {
          oldText: find,
          newText: replace,
          replaceAll,
          expectedVersion,
        });
        return { node };
      }),
  );

  server.registerTool(
    "move_node",
    {
      title: "Move / Reorder Node",
      description:
        "Reparent a node under parentId (or null for root) and position it using beforeNodeId and/or afterNodeId.",
      inputSchema: {
        nodeId: z.string().min(1).describe("Node ID to move."),
        parentId: z.string().min(1).nullable().describe("New parent node ID, or null to move to space root."),
        beforeNodeId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional sibling node ID that the moved node should be placed immediately before."),
        afterNodeId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional sibling node ID that the moved node should be placed immediately after."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ nodeId, parentId, beforeNodeId, afterNodeId }) =>
      runTool(async () => {
        assertWritePermission(ctx, "move_node");
        const existing = await services.nodes.getNode(ctx, nodeId);
        if (!existing) {
          throw new McpNotFoundError(`Node "${nodeId}" not found.`);
        }
        assertSpaceAccess(ctx, existing.spaceId, "move_node");

        if (parentId === nodeId) {
          throw new McpValidationError(`Cannot move node "${nodeId}" under itself.`);
        }
        if (parentId !== null) {
          await verifyParentNode(services, ctx, existing.spaceId, parentId, "move_node");
        }

        const tree = await services.nodes.getTree(ctx, existing.spaceId);
        const existingInTree = findNodeInTree(tree, nodeId);
        if (existingInTree && parentId !== null && isDescendantInTree(existingInTree, parentId)) {
          throw new McpValidationError(
            `Cannot move node "${nodeId}" under its own descendant "${parentId}".`,
          );
        }

        const siblings = getSiblingsForParent(tree, parentId, nodeId);
        let sortOrder: string;

        if (afterNodeId && beforeNodeId) {
          const afterNode = siblings.find((item) => item.id === afterNodeId);
          const beforeNode = siblings.find((item) => item.id === beforeNodeId);
          if (!afterNode) {
            throw new McpValidationError(
              `Sibling afterNodeId "${afterNodeId}" was not found under target parent.`,
            );
          }
          if (!beforeNode) {
            throw new McpValidationError(
              `Sibling beforeNodeId "${beforeNodeId}" was not found under target parent.`,
            );
          }
          if (afterNode.sortOrder >= beforeNode.sortOrder) {
            throw new McpValidationError(
              `Invalid sibling bounds: afterNodeId "${afterNodeId}" is not ordered before beforeNodeId "${beforeNodeId}".`,
            );
          }
          sortOrder = rankBetween(afterNode.sortOrder, beforeNode.sortOrder);
        } else if (beforeNodeId) {
          const idx = siblings.findIndex((item) => item.id === beforeNodeId);
          if (idx === -1) {
            throw new McpValidationError(
              `Sibling beforeNodeId "${beforeNodeId}" was not found under target parent.`,
            );
          }
          const prevOrder = idx > 0 ? siblings[idx - 1]!.sortOrder : null;
          const nextOrder = siblings[idx]!.sortOrder;
          sortOrder = prevOrder ? rankBetween(prevOrder, nextOrder) : rankBefore(nextOrder);
        } else if (afterNodeId) {
          const idx = siblings.findIndex((item) => item.id === afterNodeId);
          if (idx === -1) {
            throw new McpValidationError(
              `Sibling afterNodeId "${afterNodeId}" was not found under target parent.`,
            );
          }
          const prevOrder = siblings[idx]!.sortOrder;
          const nextOrder = idx + 1 < siblings.length ? siblings[idx + 1]!.sortOrder : null;
          sortOrder = nextOrder ? rankBetween(prevOrder, nextOrder) : rankAfter(prevOrder);
        } else {
          const lastOrder = siblings.at(-1)?.sortOrder ?? null;
          sortOrder = rankAfter(lastOrder);
        }

        const node = await services.nodes.moveNode(ctx, nodeId, { parentId, sortOrder });
        return { node };
      }),
  );

  // ---------------------------------------------------------------------------
  // Specialized Guardrail Tools (write scope required)
  // ---------------------------------------------------------------------------

  server.registerTool(
    "upsert_excalidraw",
    {
      title: "Upsert Excalidraw Diagram",
      description:
        "Create or update an Excalidraw diagram node. Runs normalizeExcalidrawDocument to populate required Excalidraw metadata, seeds, bindings, and defaults safely.",
      inputSchema: {
        nodeId: z
          .string()
          .min(1)
          .optional()
          .describe("Existing Excalidraw node ID to update. Omit to create a new node."),
        spaceId: z
          .string()
          .min(1)
          .optional()
          .describe("Target space ID when creating a new Excalidraw node."),
        parentId: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("Optional parent node ID when creating a new Excalidraw node."),
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe("Node title (required when creating; optional when updating)."),
        icon: z.string().trim().max(64).nullable().optional().describe("Optional icon."),
        document: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .describe("Excalidraw scene document (JSON object or JSON string)."),
        expectedVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional optimistic concurrency version when updating."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ nodeId, spaceId, parentId, title, icon, document, expectedVersion }) =>
      runTool(async () => {
        assertWritePermission(ctx, "upsert_excalidraw");
        const rawDoc = parseJsonDocument(document, "Excalidraw document");
        const normalized = normalizeExcalidrawDocument(rawDoc);
        const warnings = detectExcalidrawWarnings(normalized.files);
        const content = JSON.stringify(normalized);

        const node = await upsertTypedNode(
          services,
          ctx,
          "upsert_excalidraw",
          "excalidraw",
          { nodeId, spaceId, parentId, title, icon, expectedVersion },
          content,
        );

        return {
          node,
          elementCount: normalized.elements.length,
          excalidrawVersion: normalized.version,
          warnings,
        };
      }),
  );

  server.registerTool(
    "publish_html_artifact",
    {
      title: "Publish HTML Artifact",
      description:
        "Create or update a self-contained HTML Artifact node and return its preview URL and /ui-sdk/* asset references. Warns if inline base64 data URIs are detected.",
      inputSchema: {
        nodeId: z
          .string()
          .min(1)
          .optional()
          .describe("Existing HTML artifact node ID to update. Omit to create a new node."),
        spaceId: z
          .string()
          .min(1)
          .optional()
          .describe("Target space ID when creating a new HTML artifact node."),
        parentId: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("Optional parent node ID when creating a new HTML artifact node."),
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe("Node title (required when creating; optional when updating)."),
        icon: z.string().trim().max(64).nullable().optional().describe("Optional icon."),
        html: z.string().min(1).describe("Self-contained HTML document content."),
        expectedVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional optimistic concurrency version when updating."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ nodeId, spaceId, parentId, title, icon, html, expectedVersion }) =>
      runTool(async () => {
        assertWritePermission(ctx, "publish_html_artifact");
        const warnings = detectHtmlWarnings(html);

        const node = await upsertTypedNode(
          services,
          ctx,
          "publish_html_artifact",
          "html",
          { nodeId, spaceId, parentId, title, icon, expectedVersion },
          html,
        );

        return {
          node,
          previewUrl: `/spaces/${node.spaceId}/nodes/${node.id}`,
          uiSdkAssets: UI_SDK_MANIFEST.artifactRuntime.endpoints,
          warnings,
        };
      }),
  );

  server.registerTool(
    "upsert_canvas",
    {
      title: "Upsert JSON Canvas",
      description:
        "Create or update a JSON Canvas 1.0 node. Validates against jsonCanvasDocumentSchema and verifies every referenced workspace nodeId exists and is within token scope.",
      inputSchema: {
        nodeId: z
          .string()
          .min(1)
          .optional()
          .describe("Existing Canvas node ID to update. Omit to create a new node."),
        spaceId: z
          .string()
          .min(1)
          .optional()
          .describe("Target space ID when creating a new Canvas node."),
        parentId: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("Optional parent node ID when creating a new Canvas node."),
        title: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe("Node title (required when creating; optional when updating)."),
        icon: z.string().trim().max(64).nullable().optional().describe("Optional icon."),
        document: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .describe("JSON Canvas 1.0 document (JSON object or JSON string)."),
        expectedVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional optimistic concurrency version when updating."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ nodeId, spaceId, parentId, title, icon, document, expectedVersion }) =>
      runTool(async () => {
        assertWritePermission(ctx, "upsert_canvas");
        const rawDoc = parseJsonDocument(document, "JSON Canvas document");
        const parsed = jsonCanvasDocumentSchema.parse(rawDoc);

        // Verify canvas edge endpoints reference existing canvas nodes.
        const canvasNodeIds = new Set(parsed.nodes.map((item) => item.id));
        for (const edge of parsed.edges) {
          if (!canvasNodeIds.has(edge.fromNode)) {
            throw new McpValidationError(
              `Canvas edge "${edge.id}" references missing fromNode "${edge.fromNode}".`,
            );
          }
          if (!canvasNodeIds.has(edge.toNode)) {
            throw new McpValidationError(
              `Canvas edge "${edge.id}" references missing toNode "${edge.toNode}".`,
            );
          }
        }

        // Verify every referenced workspace nodeId exists and is accessible within scope.
        const checkedNodeIds = new Set<string>();
        for (const canvasNode of parsed.nodes) {
          if (canvasNode.type === "file" && canvasNode.nodeId) {
            if (checkedNodeIds.has(canvasNode.nodeId)) continue;
            const refNode = await services.nodes.getNode(ctx, canvasNode.nodeId);
            if (!refNode) {
              throw new McpValidationError(
                `Referenced workspace nodeId "${canvasNode.nodeId}" in canvas file node "${canvasNode.id}" does not exist.`,
              );
            }
            assertSpaceAccess(ctx, refNode.spaceId, "upsert_canvas");
            checkedNodeIds.add(canvasNode.nodeId);
          }
        }

        const content = JSON.stringify(parsed);
        const node = await upsertTypedNode(
          services,
          ctx,
          "upsert_canvas",
          "canvas",
          { nodeId, spaceId, parentId, title, icon, expectedVersion },
          content,
        );

        return {
          node,
          nodeCount: parsed.nodes.length,
          edgeCount: parsed.edges.length,
        };
      }),
  );

  server.registerTool(
    "upload_media",
    {
      title: "Upload Media to Gallery",
      description:
        "Upload an image or media file into Merak's deduplicated Media Gallery from base64Data or sourceUrl, returning its canonical /api/media/<id> URL.",
      inputSchema: {
        filename: z.string().trim().min(1).max(255).describe("Original filename (e.g. architecture.png)."),
        mimeType: z
          .string()
          .trim()
          .min(1)
          .max(128)
          .optional()
          .describe('MIME type (e.g. "image/png"). Optional if inferred from data URI or remote Content-Type.'),
        spaceId: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("Optional space ID to associate the media with."),
        width: z.number().int().positive().nullable().optional().describe("Optional image width in pixels."),
        height: z.number().int().positive().nullable().optional().describe("Optional image height in pixels."),
        base64Data: z
          .string()
          .min(1)
          .optional()
          .describe("Raw base64 string or data:<mimeType>;base64,<payload> URI."),
        sourceUrl: z
          .string()
          .url()
          .optional()
          .describe("Optional remote http(s) URL to download and store in the Media Gallery."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ filename, mimeType, spaceId, width, height, base64Data, sourceUrl }) =>
      runTool(async () => {
        assertWritePermission(ctx, "upload_media");
        if (spaceId) {
          assertSpaceAccess(ctx, spaceId, "upload_media");
        }

        const hasBase64 = typeof base64Data === "string" && base64Data.length > 0;
        const hasSourceUrl = typeof sourceUrl === "string" && sourceUrl.length > 0;
        if (hasBase64 === hasSourceUrl) {
          throw new McpValidationError(
            'Provide exactly one of "base64Data" or "sourceUrl" when calling upload_media.',
          );
        }

        const payload = hasBase64
          ? decodeBase64Payload(base64Data!, mimeType)
          : await fetchRemoteMedia(sourceUrl!, mimeType);

        const media = await services.media.uploadMedia(ctx, {
          spaceId: spaceId ?? null,
          filename,
          mimeType: payload.mimeType,
          data: payload.buffer,
          width: width ?? null,
          height: height ?? null,
        });

        return {
          media,
          url: API_ROUTES.mediaById(media.id),
        };
      }),
  );
}
