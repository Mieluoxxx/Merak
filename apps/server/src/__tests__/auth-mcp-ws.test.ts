import {
  type McpTokenDto,
  type NodeDetailDto,
  type SpaceDto,
  type WsServerEvent,
} from "@merak/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthContext } from "../services/types.js";
import type { WsClientSocket } from "../ws/broadcaster.js";
import {
  createTestEnv,
  extractCookieHeader,
  signUpUser,
  type TestEnv,
} from "./test-env.js";

function createMockSocket(): {
  socket: WsClientSocket;
  messages: unknown[];
} {
  const messages: unknown[] = [];
  const socket: WsClientSocket = {
    send(data: string) {
      messages.push(JSON.parse(data));
    },
  };
  return { socket, messages };
}

describe("Better Auth Organizations, MCP Tokens & WebSocket Broadcaster", () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    env.cleanup();
  });

  function req(urlPath: string, headers: Record<string, string>, init?: RequestInit) {
    return env.app.request(`http://localhost:3000${urlPath}`, {
      ...init,
      headers: {
        Origin: "http://localhost:3000",
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
        ...init?.headers,
      },
    });
  }

  it("auto-provisions Personal Org + knowledge space on sign-up and enforces team invitation membership", async () => {
    // Unauthenticated API access returns 401
    expect((await env.app.request("http://localhost:3000/api/spaces")).status).toBe(401);

    const owner = await signUpUser(env.app, {
      name: "Owner One",
      email: "owner@example.com",
      password: "Password123!",
    });
    const invitee = await signUpUser(env.app, {
      name: "Teammate Two",
      email: "teammate@example.com",
      password: "Password123!",
    });

    // Verify owner session has activeOrganizationId and default knowledge space
    const sessionRes = await req("/api/auth/get-session", { Cookie: owner.cookie });
    expect(sessionRes.status).toBe(200);
    const sessionData = (await sessionRes.json()) as {
      session: { activeOrganizationId: string | null };
    };
    expect(sessionData.session.activeOrganizationId).toBeTruthy();

    const ownerSpaces = (await (
      await req("/api/spaces", { Cookie: owner.cookie })
    ).json()) as SpaceDto[];
    expect(ownerSpaces).toHaveLength(1);
    expect(ownerSpaces[0]?.slug).toBe("knowledge");
    expect(ownerSpaces[0]?.name).toBe("Knowledge Base");

    // Owner creates a Team Organization via Better Auth organization plugin
    const createOrgRes = await req(
      "/api/auth/organization/create",
      { Cookie: owner.cookie },
      {
        method: "POST",
        body: JSON.stringify({ name: "Merak Core Team", slug: "merak-core-team" }),
      },
    );
    expect(createOrgRes.status).toBe(200);
    const teamOrg = (await createOrgRes.json()) as { id: string; slug: string };
    expect(teamOrg.id).toBeTruthy();

    // Switch owner's active org to the new team org
    const setActiveOwner = await req(
      "/api/auth/organization/set-active",
      { Cookie: owner.cookie },
      {
        method: "POST",
        body: JSON.stringify({ organizationId: teamOrg.id }),
      },
    );
    expect(setActiveOwner.status).toBe(200);
    const ownerUpdatedCookie = extractCookieHeader(setActiveOwner) || owner.cookie;

    // Owner creates a shared space in the team org
    const teamSpaceRes = await req(
      "/api/spaces",
      { Cookie: ownerUpdatedCookie },
      {
        method: "POST",
        body: JSON.stringify({
          kind: "project",
          name: "Shared Engineering",
          slug: "shared-eng",
        }),
      },
    );
    expect(teamSpaceRes.status).toBe(201);
    const teamSpace = (await teamSpaceRes.json()) as SpaceDto;
    expect(teamSpace.orgId).toBe(teamOrg.id);

    // Before accepting invite, teammate cannot access teamSpace or set teamOrg active
    const preAccess = await req(`/api/spaces/${teamSpace.id}`, {
      Cookie: invitee.cookie,
    });
    expect(preAccess.status).toBe(404);

    // Owner invites teammate
    const inviteRes = await req(
      "/api/auth/organization/invite-member",
      { Cookie: ownerUpdatedCookie },
      {
        method: "POST",
        body: JSON.stringify({
          organizationId: teamOrg.id,
          email: "teammate@example.com",
          role: "member",
        }),
      },
    );
    expect(inviteRes.status).toBe(200);
    const invitation = (await inviteRes.json()) as { id: string };
    expect(invitation.id).toBeTruthy();

    // Teammate accepts invitation
    const acceptRes = await req(
      "/api/auth/organization/accept-invitation",
      { Cookie: invitee.cookie },
      {
        method: "POST",
        body: JSON.stringify({ invitationId: invitation.id }),
      },
    );
    expect(acceptRes.status).toBe(200);

    // Teammate switches active organization to teamOrg
    const setActiveInvitee = await req(
      "/api/auth/organization/set-active",
      { Cookie: invitee.cookie },
      {
        method: "POST",
        body: JSON.stringify({ organizationId: teamOrg.id }),
      },
    );
    expect(setActiveInvitee.status).toBe(200);
    const inviteeUpdatedCookie = extractCookieHeader(setActiveInvitee) || invitee.cookie;

    // Teammate can now access the shared space and create a node inside it
    const teammateSpaceRes = await req(`/api/spaces/${teamSpace.id}`, {
      Cookie: inviteeUpdatedCookie,
    });
    expect(teammateSpaceRes.status).toBe(200);

    const teammateNodeRes = await req(
      "/api/nodes",
      { Cookie: inviteeUpdatedCookie },
      {
        method: "POST",
        body: JSON.stringify({
          spaceId: teamSpace.id,
          type: "doc",
          title: "Teammate Notes",
          content: "Collaborating in team org!",
        }),
      },
    );
    expect(teammateNodeRes.status).toBe(201);
  });

  it("enforces MCP token lifecycle, read/write permissions, space allowlists, and revocation", async () => {
    const alice = await signUpUser(env.app, {
      name: "Alice Token",
      email: "alice-token@example.com",
      password: "Password123!",
    });

    const initialSpaces = (await (
      await req("/api/spaces", { Cookie: alice.cookie })
    ).json()) as SpaceDto[];
    const spaceA = initialSpaces[0]!;

    const spaceB = (await (
      await req(
        "/api/spaces",
        { Cookie: alice.cookie },
        {
          method: "POST",
          body: JSON.stringify({ kind: "project", name: "Private B", slug: "private-b" }),
        },
      )
    ).json()) as SpaceDto;

    // Seed one node in each space
    const nodeA = (await (
      await req(
        "/api/nodes",
        { Cookie: alice.cookie },
        {
          method: "POST",
          body: JSON.stringify({
            spaceId: spaceA.id,
            type: "doc",
            title: "Doc A",
            content: "SharedTokenSearchTerm in A",
          }),
        },
      )
    ).json()) as NodeDetailDto;

    const nodeB = (await (
      await req(
        "/api/nodes",
        { Cookie: alice.cookie },
        {
          method: "POST",
          body: JSON.stringify({
            spaceId: spaceB.id,
            type: "doc",
            title: "Doc B",
            content: "SharedTokenSearchTerm in B",
          }),
        },
      )
    ).json()) as NodeDetailDto;

    // Create a read-only token scoped strictly to spaceA
    const readTokRes = await req(
      "/api/mcp-tokens",
      { Cookie: alice.cookie },
      {
        method: "POST",
        body: JSON.stringify({
          name: "Read Space A",
          scopes: { spaceIds: [spaceA.id], permission: "read" },
        }),
      },
    );
    expect(readTokRes.status).toBe(201);
    const { token: readTok, rawToken: readRaw } = (await readTokRes.json()) as {
      token: McpTokenDto;
      rawToken: string;
    };
    expect(readRaw.startsWith("mrk_")).toBe(true);
    expect(readTok.prefix).toBe(readRaw.slice(0, 12));

    const readAuth = { Authorization: `Bearer ${readRaw}` };

    // List spaces only returns spaceA
    const scopedSpaces = (await (await req("/api/spaces", readAuth)).json()) as SpaceDto[];
    expect(scopedSpaces.map((s) => s.id)).toEqual([spaceA.id]);

    // Can read nodeA, forbidden on nodeB
    expect((await req(`/api/nodes/${nodeA.id}`, readAuth)).status).toBe(200);
    expect((await req(`/api/nodes/${nodeB.id}`, readAuth)).status).toBe(403);

    // Search only returns results from spaceA
    const searchResults = (await (
      await req("/api/search?q=SharedTokenSearchTerm", readAuth)
    ).json()) as Array<{ nodeId: string }>;
    expect(searchResults.map((r) => r.nodeId)).toEqual([nodeA.id]);

    // Read-only token cannot write -> 403
    const writeBlocked = await req("/api/nodes", readAuth, {
      method: "POST",
      body: JSON.stringify({ spaceId: spaceA.id, type: "doc", title: "Blocked" }),
    });
    expect(writeBlocked.status).toBe(403);

    // Create a write token scoped to spaceA
    const writeTokRes = await req(
      "/api/mcp-tokens",
      { Cookie: alice.cookie },
      {
        method: "POST",
        body: JSON.stringify({
          name: "Write Space A",
          scopes: { spaceIds: [spaceA.id], permission: "write" },
        }),
      },
    );
    expect(writeTokRes.status).toBe(201);
    const { token: writeTok, rawToken: writeRaw } = (await writeTokRes.json()) as {
      token: McpTokenDto;
      rawToken: string;
    };

    const writeAuth = { Authorization: `Bearer ${writeRaw}` };

    // Can create node in spaceA, forbidden in spaceB
    const writeAllowed = await req("/api/nodes", writeAuth, {
      method: "POST",
      body: JSON.stringify({ spaceId: spaceA.id, type: "doc", title: "Agent Created" }),
    });
    expect(writeAllowed.status).toBe(201);

    const writeOutOfScope = await req("/api/nodes", writeAuth, {
      method: "POST",
      body: JSON.stringify({ spaceId: spaceB.id, type: "doc", title: "Forbidden" }),
    });
    expect(writeOutOfScope.status).toBe(403);

    // List tokens shows lastUsedAt populated
    const tokenList = (await (
      await req("/api/mcp-tokens", { Cookie: alice.cookie })
    ).json()) as McpTokenDto[];
    const usedWriteTok = tokenList.find((t) => t.id === writeTok.id);
    expect(usedWriteTok?.lastUsedAt).toBeTruthy();

    // Revoke write token -> immediately unauthorized (401)
    const revokeRes = await req(
      `/api/mcp-tokens/${writeTok.id}`,
      { Cookie: alice.cookie },
      { method: "DELETE" },
    );
    expect(revokeRes.status).toBe(204);

    expect((await req("/api/spaces", writeAuth)).status).toBe(401);
    expect(readTok.id).toBeTruthy();
  });

  it("handles WebSocket subscriptions, ping/pong, space isolation, and event broadcasting", async () => {
    // Unauthenticated /ws HTTP request returns 401
    expect((await env.app.request("http://localhost:3000/ws")).status).toBe(401);

    const alice = await signUpUser(env.app, {
      name: "Alice WS",
      email: "alice-ws@example.com",
      password: "Password123!",
    });
    const bob = await signUpUser(env.app, {
      name: "Bob WS",
      email: "bob-ws@example.com",
      password: "Password123!",
    });

    const aliceSpaces = (await (
      await req("/api/spaces", { Cookie: alice.cookie })
    ).json()) as SpaceDto[];
    const aliceSpace = aliceSpaces[0]!;
    const bobSpaces = (await (
      await req("/api/spaces", { Cookie: bob.cookie })
    ).json()) as SpaceDto[];
    const bobSpace = bobSpaces[0]!;

    const broadcaster = env.services.broadcaster!;
    const aliceCtx: AuthContext = {
      userId: alice.user.id,
      orgId: aliceSpace.orgId,
      role: "owner",
      authType: "session",
    };
    const bobCtx: AuthContext = {
      userId: bob.user.id,
      orgId: bobSpace.orgId,
      role: "owner",
      authType: "session",
    };

    const aliceClient = createMockSocket();
    const bobClient = createMockSocket();
    broadcaster.addClient(aliceClient.socket, aliceCtx);
    broadcaster.addClient(bobClient.socket, bobCtx);

    // Ping -> pong
    await broadcaster.handleMessage(aliceClient.socket, JSON.stringify({ type: "ping" }));
    expect(aliceClient.messages.at(-1)).toEqual({ type: "pong" });

    // Alice subscribes to her own space
    await broadcaster.handleMessage(
      aliceClient.socket,
      JSON.stringify({ type: "subscribe", spaceId: aliceSpace.id }),
    );
    expect(broadcaster.getSpaceSubscriberCount(aliceSpace.id)).toBe(1);

    // Bob tries to subscribe to Alice's space -> rejected!
    await broadcaster.handleMessage(
      bobClient.socket,
      JSON.stringify({ type: "subscribe", spaceId: aliceSpace.id }),
    );
    expect(broadcaster.getSpaceSubscriberCount(aliceSpace.id)).toBe(1);
    expect(bobClient.messages.at(-1)).toMatchObject({ type: "error" });

    // Creating a node in Alice's space dispatches node.created to Alice, not Bob
    const node = await env.services.nodes.createNode(aliceCtx, {
      spaceId: aliceSpace.id,
      type: "doc",
      title: "Realtime Doc",
      content: "Live sync",
    });

    const aliceEvents = aliceClient.messages.filter(
      (m): m is WsServerEvent => (m as { type?: string }).type === "node.created",
    );
    expect(aliceEvents).toHaveLength(1);
    expect(aliceEvents[0]).toMatchObject({
      type: "node.created",
      orgId: aliceSpace.orgId,
      spaceId: aliceSpace.id,
      nodeId: node.id,
    });

    const bobNodeEvents = bobClient.messages.filter(
      (m) => (m as { type?: string }).type === "node.created",
    );
    expect(bobNodeEvents).toHaveLength(0);

    // Unsubscribe stops further event delivery
    await broadcaster.handleMessage(
      aliceClient.socket,
      JSON.stringify({ type: "unsubscribe", spaceId: aliceSpace.id }),
    );
    expect(broadcaster.getSpaceSubscriberCount(aliceSpace.id)).toBe(0);

    await env.services.nodes.updateNode(aliceCtx, node.id, {
      title: "Updated After Unsub",
      expectedVersion: 1,
    });
    const aliceUpdatedEvents = aliceClient.messages.filter(
      (m) => (m as { type?: string }).type === "node.updated",
    );
    expect(aliceUpdatedEvents).toHaveLength(0);

    broadcaster.removeClient(aliceClient.socket);
    broadcaster.removeClient(bobClient.socket);
    expect(broadcaster.getClientCount()).toBe(0);
  });
});
