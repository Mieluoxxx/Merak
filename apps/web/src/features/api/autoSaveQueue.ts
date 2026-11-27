import type { NodeDetailDto, UpdateNodeInput } from "@merak/shared";

export interface NodePatchPayload {
  content?: string;
  title?: string;
}

export interface NodeSaveState {
  inFlight: boolean;
  hasQueued: boolean;
  lastOutcome: "saved" | "error" | null;
}

export interface NodeSaveQueueDeps {
  getExpectedVersion: (nodeId: string) => number | undefined;
  sendPatch: (
    nodeId: string,
    payload: UpdateNodeInput,
    options?: { keepalive?: boolean },
  ) => Promise<NodeDetailDto>;
  onSaved: (nodeId: string, updated: NodeDetailDto, sent: NodePatchPayload) => void;
  onError: (nodeId: string, error: unknown, sent: NodePatchPayload) => void;
  onStateChange?: (nodeId: string, state: NodeSaveState) => void;
}

interface NodeSlot {
  queued: NodePatchPayload | null;
  queuedKeepalive: boolean;
  inFlight: Promise<void> | null;
}

export interface NodeSaveQueue {
  enqueue: (
    nodeId: string,
    patch: NodePatchPayload,
    options?: { keepalive?: boolean },
  ) => Promise<void>;
  isBusy: (nodeId: string) => boolean;
  flush: (nodeId?: string, options?: { keepalive?: boolean }) => Promise<void>;
}

function mergePatch(
  base: NodePatchPayload | null,
  incoming: NodePatchPayload,
): NodePatchPayload {
  const next: NodePatchPayload = base ? { ...base } : {};
  if (incoming.content !== undefined) {
    next.content = incoming.content;
  }
  if (incoming.title !== undefined) {
    next.title = incoming.title;
  }
  return next;
}

export function createNodeSaveQueue(deps: NodeSaveQueueDeps): NodeSaveQueue {
  const slots = new Map<string, NodeSlot>();

  const getSlot = (nodeId: string): NodeSlot => {
    let slot = slots.get(nodeId);
    if (!slot) {
      slot = { queued: null, queuedKeepalive: false, inFlight: null };
      slots.set(nodeId, slot);
    }
    return slot;
  };

  const notifyState = (
    nodeId: string,
    slot: NodeSlot,
    lastOutcome: "saved" | "error" | null = null,
  ) => {
    deps.onStateChange?.(nodeId, {
      inFlight: slot.inFlight !== null,
      hasQueued: slot.queued !== null,
      lastOutcome,
    });
  };

  const startDrain = (nodeId: string, slot: NodeSlot): Promise<void> => {
    if (slot.inFlight) {
      return slot.inFlight;
    }

    let lastOutcome: "saved" | "error" | null = null;

    const drainPromise = (async () => {
      while (slot.queued !== null) {
        const batch = slot.queued;
        const keepalive = slot.queuedKeepalive;
        slot.queued = null;
        slot.queuedKeepalive = false;
        notifyState(nodeId, slot);

        const expectedVersion = deps.getExpectedVersion(nodeId);
        const requestBody: UpdateNodeInput = {
          ...(batch.content !== undefined ? { content: batch.content } : {}),
          ...(batch.title !== undefined ? { title: batch.title } : {}),
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
        };

        try {
          const updated = await deps.sendPatch(
            nodeId,
            requestBody,
            keepalive ? { keepalive: true } : undefined,
          );
          deps.onSaved(nodeId, updated, batch);
          lastOutcome = "saved";
        } catch (err) {
          deps.onError(nodeId, err, batch);
          lastOutcome = "error";
        }
      }
    })().finally(() => {
      slot.inFlight = null;
      if (slot.queued === null) {
        slots.delete(nodeId);
        notifyState(nodeId, slot, lastOutcome);
      } else {
        notifyState(nodeId, slot, lastOutcome);
        void startDrain(nodeId, slot);
      }
    });

    slot.inFlight = drainPromise;
    notifyState(nodeId, slot);
    return drainPromise;
  };

  return {
    enqueue(nodeId, patch, options) {
      if (patch.content === undefined && patch.title === undefined) {
        return getSlot(nodeId).inFlight ?? Promise.resolve();
      }
      const slot = getSlot(nodeId);
      slot.queued = mergePatch(slot.queued, patch);
      if (options?.keepalive) {
        slot.queuedKeepalive = true;
      }
      notifyState(nodeId, slot);
      return startDrain(nodeId, slot);
    },

    isBusy(nodeId) {
      const slot = slots.get(nodeId);
      return Boolean(slot && (slot.inFlight !== null || slot.queued !== null));
    },

    async flush(nodeId, options) {
      if (nodeId) {
        const slot = slots.get(nodeId);
        if (!slot) return;
        if (options?.keepalive && slot.queued) {
          slot.queuedKeepalive = true;
        }
        await (slot.inFlight ?? Promise.resolve());
        return;
      }

      const pending: Promise<void>[] = [];
      for (const slot of slots.values()) {
        if (options?.keepalive && slot.queued) {
          slot.queuedKeepalive = true;
        }
        if (slot.inFlight) {
          pending.push(slot.inFlight);
        }
      }
      await Promise.all(pending);
    },
  };
}
