import {
  type NodeDetailDto,
  type NodeTreeItemDto,
  rankBefore,
  rankBetween,
  type SpaceDto,
} from "@merak/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, signUpUser, type TestEnv } from "./test-env.js";

describe("Spaces & Nodes CRUD, Optimistic Concurrency, Patching, Move & Trash", () => {
  let env: TestEnv;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    env = createTestEnv();
    const alice = await signUpUser(env.app, {
      name: "Alice",
      email: "alice@example.com",
      password: "Password123!",
    });
    const bob = await signUpUser(env.app, {
      name: "Bob",
      email: "bob@example.com",
      password: "Password123!",
    });
    aliceCookie = alice.cookie;
    bobCookie = bob.cookie;
  });

  afterEach(() => {
    env.cleanup();
  });

  function req(path: string, cookie: string, init?: RequestInit) {
    return env.app.request(`http://localhost:3000${path}`, {
      ...init,
      headers: {
        Cookie: cookie,
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  }

  it("manages spaces CRUD, kind filter, slug uniqueness (409), and org isolation", async () => {
    // Auto-created default knowledge space exists
    const initialRes = await req("/api/spaces", aliceCookie);
    expect(initialRes.status).toBe(200);
    const initialSpaces = (await initialRes.json()) as SpaceDto[];
    expect(initialSpaces).toHaveLength(1);
    expect(initialSpaces[0]?.kind).toBe("knowledge");
    expect(initialSpaces[0]?.slug).toBe("knowledge");

    // Create a project space
    const createRes = await req("/api/spaces", aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        kind: "project",
        name: "Merak Launch",
        slug: "merak-launch",
        description: "Launch plan",
      }),
    });
    expect(createRes.status).toBe(201);
    const projectSpace = (await createRes.json()) as SpaceDto;
    expect(projectSpace.slug).toBe("merak-launch");

    // Duplicate explicit slug -> 409
    const dupRes = await req("/api/spaces", aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        kind: "project",
        name: "Duplicate",
        slug: "merak-launch",
      }),
    });
    expect(dupRes.status).toBe(409);

    // Filter by kind
    const projectsRes = await req("/api/spaces?kind=project", aliceCookie);
    expect(projectsRes.status).toBe(200);
    const projects = (await projectsRes.json()) as SpaceDto[];
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).toBe(projectSpace.id);

    // Update space
    const patchRes = await req(`/api/spaces/${projectSpace.id}`, aliceCookie, {
      method: "PATCH",
      body: JSON.stringify({ name: "Merak v1 Launch", icon: "rocket" }),
    });
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as SpaceDto;
    expect(updated.name).toBe("Merak v1 Launch");
    expect(updated.icon).toBe("rocket");

    // Org isolation: Bob cannot see or update Alice's space
    const bobGetRes = await req(`/api/spaces/${projectSpace.id}`, bobCookie);
    expect(bobGetRes.status).toBe(404);

    // Delete space
    const delRes = await req(`/api/spaces/${projectSpace.id}`, aliceCookie, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(204);

    const afterDelRes = await req(`/api/spaces/${projectSpace.id}`, aliceCookie);
    expect(afterDelRes.status).toBe(404);
  });

  it("handles nested node tree, optimistic concurrency (409), and exact patchDoc", async () => {
    const spaces = (await (await req("/api/spaces", aliceCookie)).json()) as SpaceDto[];
    const spaceId = spaces[0]!.id;

    // Create root doc and two nested children
    const rootRes = await req("/api/nodes", aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        spaceId,
        type: "doc",
        title: "Architecture",
        content: "# Architecture\n\nStatus: draft\nCost: $100\nStatus: draft",
      }),
    });
    expect(rootRes.status).toBe(201);
    const rootNode = (await rootRes.json()) as NodeDetailDto;
    expect(rootNode.version).toBe(1);

    const childARes = await req("/api/nodes", aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        spaceId,
        parentId: rootNode.id,
        type: "excalidraw",
        title: "System Diagram",
        content: JSON.stringify({ type: "excalidraw", version: 2, elements: [] }),
      }),
    });
    expect(childARes.status).toBe(201);
    const childA = (await childARes.json()) as NodeDetailDto;

    const childBRes = await req("/api/nodes", aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        spaceId,
        parentId: rootNode.id,
        type: "html",
        title: "Metrics Dashboard",
        content: "<h1>Metrics</h1>",
      }),
    });
    expect(childBRes.status).toBe(201);
    const childB = (await childBRes.json()) as NodeDetailDto;

    // Verify tree nesting and ordering
    const treeRes = await req(`/api/spaces/${spaceId}/tree`, aliceCookie);
    expect(treeRes.status).toBe(200);
    const tree = (await treeRes.json()) as NodeTreeItemDto[];
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe(rootNode.id);
    expect(tree[0]?.hasChildren).toBe(true);
    expect(tree[0]?.children.map((c) => c.id)).toEqual([childA.id, childB.id]);

    // Optimistic concurrency: stale expectedVersion -> 409
    const staleRes = await req(`/api/nodes/${rootNode.id}`, aliceCookie, {
      method: "PATCH",
      body: JSON.stringify({ title: "Stale", expectedVersion: 99 }),
    });
    expect(staleRes.status).toBe(409);

    // Valid update increments version to 2
    const updateRes = await req(`/api/nodes/${rootNode.id}`, aliceCookie, {
      method: "PATCH",
      body: JSON.stringify({ title: "System Architecture", expectedVersion: 1 }),
    });
    expect(updateRes.status).toBe(200);
    const updatedRoot = (await updateRes.json()) as NodeDetailDto;
    expect(updatedRoot.version).toBe(2);
    expect(updatedRoot.title).toBe("System Architecture");

    // patchDoc: ambiguous match without replaceAll -> 422
    const ambiguousPatch = await req(`/api/nodes/${rootNode.id}/patch`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        oldText: "Status: draft",
        newText: "Status: published",
        expectedVersion: 2,
      }),
    });
    expect(ambiguousPatch.status).toBe(422);

    // patchDoc: missing text -> 422
    const missingPatch = await req(`/api/nodes/${rootNode.id}/patch`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        oldText: "nonexistent text",
        newText: "replacement",
        expectedVersion: 2,
      }),
    });
    expect(missingPatch.status).toBe(422);

    // patchDoc: version mismatch -> 409
    const conflictPatch = await req(`/api/nodes/${rootNode.id}/patch`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        oldText: "Cost: $100",
        newText: "Cost: $200",
        expectedVersion: 1,
      }),
    });
    expect(conflictPatch.status).toBe(409);

    // patchDoc: exact single match preserving literal $ replacement characters
    const singlePatch = await req(`/api/nodes/${rootNode.id}/patch`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        oldText: "Cost: $100",
        newText: "Cost: $250 ($&)",
        expectedVersion: 2,
      }),
    });
    expect(singlePatch.status).toBe(200);
    const patched1 = (await singlePatch.json()) as NodeDetailDto;
    expect(patched1.version).toBe(3);
    expect(patched1.content).toContain("Cost: $250 ($&)");

    // patchDoc: replaceAll
    const allPatch = await req(`/api/nodes/${rootNode.id}/patch`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        oldText: "Status: draft",
        newText: "Status: approved",
        replaceAll: true,
        expectedVersion: 3,
      }),
    });
    expect(allPatch.status).toBe(200);
    const patched2 = (await allPatch.json()) as NodeDetailDto;
    expect(patched2.version).toBe(4);
    expect(patched2.content.match(/Status: approved/g)).toHaveLength(2);
  });

  it("reorders nodes with LexoRank and rejects self-parent & descendant cycles (400)", async () => {
    const spaces = (await (await req("/api/spaces", aliceCookie)).json()) as SpaceDto[];
    const spaceId = spaces[0]!.id;

    const a = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({ spaceId, type: "doc", title: "A" }),
      })
    ).json()) as NodeDetailDto;
    const b = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({ spaceId, type: "doc", title: "B" }),
      })
    ).json()) as NodeDetailDto;
    const c = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({ spaceId, type: "doc", title: "C" }),
      })
    ).json()) as NodeDetailDto;

    // Move C before A
    const moveBefore = await req(`/api/nodes/${c.id}/move`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        parentId: null,
        sortOrder: rankBefore(a.sortOrder),
      }),
    });
    expect(moveBefore.status).toBe(200);

    // Move B between C and A
    const cMoved = (await moveBefore.json()) as NodeDetailDto;
    const moveBetween = await req(`/api/nodes/${b.id}/move`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({
        parentId: null,
        sortOrder: rankBetween(cMoved.sortOrder, a.sortOrder),
      }),
    });
    expect(moveBetween.status).toBe(200);

    const tree = (await (
      await req(`/api/spaces/${spaceId}/tree`, aliceCookie)
    ).json()) as NodeTreeItemDto[];
    expect(tree.map((n) => n.id)).toEqual([c.id, b.id, a.id]);

    // Build hierarchy: A -> child -> grandchild
    const child = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({ spaceId, parentId: a.id, type: "doc", title: "Child" }),
      })
    ).json()) as NodeDetailDto;
    const grandchild = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId,
          parentId: child.id,
          type: "doc",
          title: "Grandchild",
        }),
      })
    ).json()) as NodeDetailDto;

    // Self-parent -> 400
    const selfRes = await req(`/api/nodes/${a.id}/move`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({ parentId: a.id, sortOrder: "i" }),
    });
    expect(selfRes.status).toBe(400);

    // Descendant cycle (moving A under grandchild) -> 400
    const cycleRes = await req(`/api/nodes/${a.id}/move`, aliceCookie, {
      method: "POST",
      body: JSON.stringify({ parentId: grandchild.id, sortOrder: "i" }),
    });
    expect(cycleRes.status).toBe(400);
  });

  it("soft-deletes subtrees, lists trash, and restores nodes promoting orphans to root", async () => {
    const spaces = (await (await req("/api/spaces", aliceCookie)).json()) as SpaceDto[];
    const spaceId = spaces[0]!.id;

    const parent = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId,
          type: "doc",
          title: "Parent Doc",
          content: "UniqueParentKeyword",
        }),
      })
    ).json()) as NodeDetailDto;

    const child = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId,
          parentId: parent.id,
          type: "doc",
          title: "Child Doc",
          content: "UniqueChildKeyword",
        }),
      })
    ).json()) as NodeDetailDto;

    // Soft delete parent cascades to child
    const delRes = await req(`/api/nodes/${parent.id}`, aliceCookie, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(204);

    // Tree is empty, node GET returns 404, search returns nothing
    const treeEmpty = (await (
      await req(`/api/spaces/${spaceId}/tree`, aliceCookie)
    ).json()) as NodeTreeItemDto[];
    expect(treeEmpty).toHaveLength(0);

    expect((await req(`/api/nodes/${parent.id}`, aliceCookie)).status).toBe(404);
    expect((await req(`/api/nodes/${child.id}`, aliceCookie)).status).toBe(404);

    const searchDeleted = (await (
      await req("/api/search?q=UniqueChildKeyword", aliceCookie)
    ).json()) as unknown[];
    expect(searchDeleted).toHaveLength(0);

    // Both appear in trash
    const trashRes = await req(`/api/nodes/trash?spaceId=${spaceId}`, aliceCookie);
    expect(trashRes.status).toBe(200);
    const trashed = (await trashRes.json()) as NodeDetailDto[];
    expect(trashed.map((n) => n.id).sort()).toEqual([child.id, parent.id].sort());

    // Restoring child while parent is still deleted promotes child to root
    const restoreChildRes = await req(`/api/nodes/${child.id}/restore`, aliceCookie, {
      method: "POST",
    });
    expect(restoreChildRes.status).toBe(200);
    const restoredChild = (await restoreChildRes.json()) as NodeDetailDto;
    expect(restoredChild.parentId).toBeNull();
    expect(restoredChild.deletedAt).toBeNull();

    // Child is searchable again after restore
    const searchRestored = (await (
      await req("/api/search?q=UniqueChildKeyword", aliceCookie)
    ).json()) as Array<{ nodeId: string }>;
    expect(searchRestored.map((r) => r.nodeId)).toEqual([child.id]);
  });
});
