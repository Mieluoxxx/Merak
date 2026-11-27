import {
  createAgent,
  registerTools,
  type AgentAction,
  type AgentComponent,
  type AgentStep,
  type ObservedChange,
  type ThemeMode,
} from "@merak/ui";
import { useEffect, useRef, useState } from "react";
import type { WsConnectionState } from "../../lib/ws.js";

export type WorkbenchView = "workspace" | "gallery" | "mcp-tokens";

export interface MerakWorkbenchStateSnapshot {
  activeView: WorkbenchView;
  activeSpaceId: string | null;
  activeNodeId: string | null;
  theme: ThemeMode;
  commandPaletteOpen: boolean;
  realtimeState: WsConnectionState;
  hasConflict: boolean;
  spaces: Array<{ id: string; name: string; kind: "knowledge" | "project" }>;
}

export interface MerakAgentBridgeHandlers {
  getState: () => MerakWorkbenchStateSnapshot;
  navigateNode?: (nodeId: string, spaceId?: string) => void | Promise<void>;
  switchSpace?: (spaceId: string) => void | Promise<void>;
  openCommandPalette?: (opts?: { open?: boolean; query?: string }) => void | Promise<void>;
  openView?: (view: WorkbenchView) => void | Promise<void>;
}

export interface MerakToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface InitMerakAgentBridgeOptions {
  handlers: MerakAgentBridgeHandlers;
  allow?: (step: AgentAction, context: { signal: AbortSignal }) => boolean | Promise<boolean>;
  exposeWindowGlobal?: boolean;
  registerWebMcp?: boolean;
}

export interface MerakAgentBridge {
  readonly agent: ReturnType<typeof createAgent>;
  snapshot: () => AgentComponent[];
  query: ReturnType<typeof createAgent>["query"];
  act: (
    input: { steps: AgentStep[] },
    options?: { signal?: AbortSignal },
  ) => ReturnType<ReturnType<typeof createAgent>["act"]>;
  subscribe: (listener: (change: ObservedChange) => void) => () => void;
  readonly merakTools: readonly MerakToolSchema[];
  readonly allTools: readonly (
    | MerakToolSchema
    | ReturnType<typeof createAgent>["tools"][number]
  )[];
  invokeTool: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
  updateHandlers: (handlers: MerakAgentBridgeHandlers) => void;
  dispose: () => void;
}

interface ModelContextLike {
  registerTool?: (tool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (input: Record<string, unknown>) => Promise<unknown>;
  }) => unknown;
  unregisterTool?: (name: string) => void;
}

export const MERAK_WORKBENCH_TOOL_SCHEMAS: readonly MerakToolSchema[] = [
  {
    name: "merak.getState",
    description:
      "Read the current Merak workbench state including active view, space, node, theme, and realtime status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "merak.navigateNode",
    description: "Open a specific node in the Merak workbench.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Target node ID to open." },
        spaceId: { type: "string", description: "Optional space ID containing the node." },
      },
      required: ["nodeId"],
      additionalProperties: false,
    },
  },
  {
    name: "merak.switchSpace",
    description: "Switch the active space in the Merak workbench sidebar.",
    inputSchema: {
      type: "object",
      properties: {
        spaceId: { type: "string", description: "Target space ID." },
      },
      required: ["spaceId"],
      additionalProperties: false,
    },
  },
  {
    name: "merak.openCommandPalette",
    description: "Open or close the Cmd+K command palette, optionally pre-filling a search query.",
    inputSchema: {
      type: "object",
      properties: {
        open: { type: "boolean", description: "Whether to open (true) or close (false)." },
        query: { type: "string", description: "Optional initial search query." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "merak.openView",
    description: "Switch the top-level Merak workbench view (workspace, gallery, or mcp-tokens).",
    inputSchema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["workspace", "gallery", "mcp-tokens"],
          description: "Target workbench view.",
        },
      },
      required: ["view"],
      additionalProperties: false,
    },
  },
] as const;

declare global {
  interface Window {
    __MERAK_AGENT__?: MerakAgentBridge;
  }
}

export function initMerakAgentBridge(options: InitMerakAgentBridgeOptions): MerakAgentBridge {
  let currentHandlers = options.handlers;
  const allowFn = options.allow ?? ((step: AgentAction) => !step.confirm);

  const agent = createAgent({ allow: allowFn });

  const invokeTool = async (
    name: string,
    input: Record<string, unknown> = {},
  ): Promise<unknown> => {
    if (name === "snapshot") {
      return agent.snapshot();
    }
    if (name === "query") {
      return agent.query(input as Parameters<typeof agent.query>[0]);
    }
    if (name === "act") {
      return agent.act(input as Parameters<typeof agent.act>[0]);
    }

    switch (name) {
      case "merak.getState":
        return currentHandlers.getState();
      case "merak.navigateNode": {
        const nodeId = typeof input.nodeId === "string" ? input.nodeId : "";
        const spaceId = typeof input.spaceId === "string" ? input.spaceId : undefined;
        if (!nodeId) {
          throw new Error("merak.navigateNode requires a non-empty string nodeId");
        }
        await currentHandlers.navigateNode?.(nodeId, spaceId);
        return { ok: true, nodeId, spaceId: spaceId ?? null };
      }
      case "merak.switchSpace": {
        const spaceId = typeof input.spaceId === "string" ? input.spaceId : "";
        if (!spaceId) {
          throw new Error("merak.switchSpace requires a non-empty string spaceId");
        }
        await currentHandlers.switchSpace?.(spaceId);
        return { ok: true, spaceId };
      }
      case "merak.openCommandPalette": {
        const open = typeof input.open === "boolean" ? input.open : true;
        const query = typeof input.query === "string" ? input.query : undefined;
        await currentHandlers.openCommandPalette?.({ open, query });
        return { ok: true, open, query: query ?? "" };
      }
      case "merak.openView": {
        const view = input.view;
        if (view !== "workspace" && view !== "gallery" && view !== "mcp-tokens") {
          throw new Error(`Invalid view "${String(view)}"`);
        }
        await currentHandlers.openView?.(view);
        return { ok: true, view };
      }
      default:
        throw new Error(`Unknown Merak agent tool: "${name}"`);
    }
  };

  let unregisterBuiltIn: () => void = () => {};
  const registeredCustomNames: string[] = [];

  if (options.registerWebMcp !== false) {
    unregisterBuiltIn = registerTools(agent, { allow: allowFn });

    const docWithModelContext =
      typeof document !== "undefined"
        ? (document as Document & { modelContext?: ModelContextLike })
        : undefined;
    const modelContext = docWithModelContext?.modelContext;

    if (modelContext && typeof modelContext.registerTool === "function") {
      for (const schema of MERAK_WORKBENCH_TOOL_SCHEMAS) {
        try {
          modelContext.registerTool({
            name: schema.name,
            description: schema.description,
            inputSchema: schema.inputSchema,
            execute: (input) => invokeTool(schema.name, input),
          });
          registeredCustomNames.push(schema.name);
        } catch {
          // Ignore environments where custom WebMCP registration is unavailable
        }
      }
    }
  }

  const bridge: MerakAgentBridge = {
    agent,
    snapshot: () => agent.snapshot(),
    query: (input) => agent.query(input),
    act: (input, opts) => agent.act(input, opts),
    subscribe: (listener) => agent.subscribe(listener),
    merakTools: MERAK_WORKBENCH_TOOL_SCHEMAS,
    allTools: [...agent.tools, ...MERAK_WORKBENCH_TOOL_SCHEMAS],
    invokeTool,
    updateHandlers: (nextHandlers) => {
      currentHandlers = nextHandlers;
    },
    dispose: () => {
      unregisterBuiltIn();
      const docWithModelContext =
        typeof document !== "undefined"
          ? (document as Document & { modelContext?: ModelContextLike })
          : undefined;
      if (docWithModelContext?.modelContext?.unregisterTool) {
        for (const name of registeredCustomNames) {
          try {
            docWithModelContext.modelContext.unregisterTool(name);
          } catch {
            // ignore cleanup errors
          }
        }
      }
      if (
        options.exposeWindowGlobal !== false &&
        typeof window !== "undefined" &&
        window.__MERAK_AGENT__ === bridge
      ) {
        delete window.__MERAK_AGENT__;
      }
    },
  };

  if (options.exposeWindowGlobal !== false && typeof window !== "undefined") {
    window.__MERAK_AGENT__ = bridge;
  }

  return bridge;
}

export function useMerakAgentBridge(
  handlers: MerakAgentBridgeHandlers,
  options?: {
    enabled?: boolean;
    allow?: InitMerakAgentBridgeOptions["allow"];
  },
): MerakAgentBridge | null {
  const enabled = options?.enabled ?? true;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [bridge, setBridge] = useState<MerakAgentBridge | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBridge(null);
      return;
    }

    const instance = initMerakAgentBridge({
      handlers: {
        getState: () => handlersRef.current.getState(),
        navigateNode: (nodeId, spaceId) => handlersRef.current.navigateNode?.(nodeId, spaceId),
        switchSpace: (spaceId) => handlersRef.current.switchSpace?.(spaceId),
        openCommandPalette: (opts) => handlersRef.current.openCommandPalette?.(opts),
        openView: (view) => handlersRef.current.openView?.(view),
      },
      allow: options?.allow,
    });
    setBridge(instance);

    return () => {
      instance.dispose();
      setBridge((prev) => (prev === instance ? null : prev));
    };
  }, [enabled, options?.allow]);

  return bridge;
}
