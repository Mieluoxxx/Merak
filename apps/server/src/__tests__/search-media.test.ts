import fs from "node:fs";
import path from "node:path";
import {
  type MediaDto,
  type MediaWithRefsDto,
  type NodeDetailDto,
  normalizeExcalidrawDocument,
  type SearchResultDto,
  type SpaceDto,
} from "@merak/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, signUpUser, type TestEnv } from "./test-env.js";

describe("FTS5 Search & Media Deduplication / Reference Tracking / Orphans", () => {
  let env: TestEnv;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    env = createTestEnv();
    const alice = await signUpUser(env.app, {
      name: "Alice",
      email: "alice-search@example.com",
      password: "Password123!",
    });
    const bob = await signUpUser(env.app, {
      name: "Bob",
      email: "bob-search@example.com",
      password: "Password123!",
    });
    aliceCookie = alice.cookie;
    bobCookie = bob.cookie;
  });

  afterEach(() => {
    env.cleanup();
  });

  function req(urlPath: string, cookie: string, init?: RequestInit) {
    return env.app.request(`http://localhost:3000${urlPath}`, {
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

  it("indexes and searches doc, excalidraw, canvas, and html with org & space isolation", async () => {
    const aliceSpaces = (await (await req("/api/spaces", aliceCookie)).json()) as SpaceDto[];
    const knowledgeSpaceId = aliceSpaces[0]!.id;

    const projectSpace = (await (
      await req("/api/spaces", aliceCookie, {
        method: "POST",
        body: JSON.stringify({ kind: "project", name: "Apollo", slug: "apollo" }),
      })
    ).json()) as SpaceDto;

    // 1. doc node
    const docNode = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId: knowledgeSpaceId,
          type: "doc",
          title: "Onboarding Runbook",
          content: "Provisioning quantum telemetry cluster step by step.",
        }),
      })
    ).json()) as NodeDetailDto;

    // 2. excalidraw node
    const excalidrawDoc = normalizeExcalidrawDocument({
      elements: [
        { id: "t1", type: "text", x: 10, y: 10, text: "Quantum Gateway Topology" },
      ],
    });
    const excalidrawNode = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId: projectSpace.id,
          type: "excalidraw",
          title: "Topology Diagram",
          content: JSON.stringify(excalidrawDoc),
        }),
      })
    ).json()) as NodeDetailDto;

    // 3. canvas node
    const canvasDoc = {
      nodes: [
        {
          id: "c1",
          type: "text",
          text: "Quantum milestone planning board",
          x: 0,
          y: 0,
          width: 240,
          height: 120,
        },
      ],
      edges: [],
    };
    const canvasNode = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId: projectSpace.id,
          type: "canvas",
          title: "Roadmap Canvas",
          content: JSON.stringify(canvasDoc),
        }),
      })
    ).json()) as NodeDetailDto;

    // 4. html node (scripts/styles should be stripped from search index)
    const htmlNode = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId: knowledgeSpaceId,
          type: "html",
          title: "Telemetry Widget",
          content:
            "<style>.secretStyle{color:red}</style><script>const hiddenScriptToken = 1;</script><main><h1>Quantum Metrics</h1></main>",
        }),
      })
    ).json()) as NodeDetailDto;

    // Search across all spaces for "Quantum"
    const allRes = await req("/api/search?q=Quantum", aliceCookie);
    expect(allRes.status).toBe(200);
    const allResults = (await allRes.json()) as SearchResultDto[];
    expect(allResults.map((r) => r.nodeId).sort()).toEqual(
      [docNode.id, excalidrawNode.id, canvasNode.id, htmlNode.id].sort(),
    );

    // HTML script content should NOT be indexed
    const scriptRes = (await (
      await req("/api/search?q=hiddenScriptToken", aliceCookie)
    ).json()) as SearchResultDto[];
    expect(scriptRes).toHaveLength(0);

    // Filter by spaceId
    const projectOnly = (await (
      await req(`/api/search?q=Quantum&spaceId=${projectSpace.id}`, aliceCookie)
    ).json()) as SearchResultDto[];
    expect(projectOnly.map((r) => r.nodeId).sort()).toEqual(
      [excalidrawNode.id, canvasNode.id].sort(),
    );

    // Special FTS5 syntax characters should not error
    const specialRes = await req(
      `/api/search?q=${encodeURIComponent('quantum: "foo" (bar-baz) OR NOT')}`,
      aliceCookie,
    );
    expect(specialRes.status).toBe(200);

    // Org isolation: Bob searches "Quantum" -> 0 results
    const bobRes = (await (
      await req("/api/search?q=Quantum", bobCookie)
    ).json()) as SearchResultDto[];
    expect(bobRes).toHaveLength(0);
  });

  it("deduplicates uploads by SHA-256, serves immutable headers, tracks media refs & cleans up orphans", async () => {
    const spaces = (await (await req("/api/spaces", aliceCookie)).json()) as SpaceDto[];
    const spaceId = spaces[0]!.id;

    const payloadBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

    const form1 = new FormData();
    form1.append("file", new File([payloadBytes], "diagram.png", { type: "image/png" }));
    form1.append("spaceId", spaceId);
    form1.append("width", "640");
    form1.append("height", "480");

    const upload1 = await req("/api/media", aliceCookie, {
      method: "POST",
      body: form1,
    });
    expect(upload1.status).toBe(201);
    const media1 = (await upload1.json()) as MediaDto;
    expect(media1.url).toBe(`/api/media/${media1.id}`);
    expect(media1.width).toBe(640);
    expect(media1.height).toBe(480);

    // Second upload of identical bytes in same org deduplicates!
    const form2 = new FormData();
    form2.append("file", new File([payloadBytes], "copy.png", { type: "image/png" }));
    form2.append("spaceId", spaceId);

    const upload2 = await req("/api/media", aliceCookie, {
      method: "POST",
      body: form2,
    });
    expect(upload2.status).toBe(201);
    const media2 = (await upload2.json()) as MediaDto;
    expect(media2.id).toBe(media1.id);
    expect(media2.sha256).toBe(media1.sha256);

    // GET media returns binary + immutable cache headers
    const downloadRes = await req(`/api/media/${media1.id}`, aliceCookie);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe("image/png");
    expect(downloadRes.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const downloadedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(Array.from(downloadedBytes)).toEqual(Array.from(payloadBytes));

    // Bob cannot read Alice's media
    expect((await req(`/api/media/${media1.id}`, bobCookie)).status).toBe(404);

    // Before any node references it, media1 is an orphan
    const orphansBefore = (await (
      await req("/api/media/orphans", aliceCookie)
    ).json()) as MediaWithRefsDto[];
    expect(orphansBefore.map((m) => m.id)).toEqual([media1.id]);
    expect(orphansBefore[0]?.refCount).toBe(0);

    // Create a doc referencing /api/media/<id>
    const doc = (await (
      await req("/api/nodes", aliceCookie, {
        method: "POST",
        body: JSON.stringify({
          spaceId,
          type: "doc",
          title: "Illustrated Doc",
          content: `Here is our architecture:\n\n![arch](${media1.url})`,
        }),
      })
    ).json()) as NodeDetailDto;

    // Now media1 has refCount === 1 and is no longer an orphan
    const mediaList = (await (
      await req(`/api/media?spaceId=${spaceId}`, aliceCookie)
    ).json()) as MediaWithRefsDto[];
    expect(mediaList).toHaveLength(1);
    expect(mediaList[0]?.refCount).toBe(1);
    expect(mediaList[0]?.refNodeIds).toEqual([doc.id]);

    const orphansWhileReferenced = (await (
      await req("/api/media/orphans", aliceCookie)
    ).json()) as MediaWithRefsDto[];
    expect(orphansWhileReferenced).toHaveLength(0);

    // Removing the image reference makes it an orphan again
    await req(`/api/nodes/${doc.id}`, aliceCookie, {
      method: "PATCH",
      body: JSON.stringify({ content: "No images anymore", expectedVersion: 1 }),
    });

    const orphansAfterEdit = (await (
      await req("/api/media/orphans", aliceCookie)
    ).json()) as MediaWithRefsDto[];
    expect(orphansAfterEdit.map((m) => m.id)).toEqual([media1.id]);

    // Delete orphan removes DB row and unlinks file from disk
    const storagePath = path.join(env.mediaDir, media1.orgId, media1.sha256);
    expect(fs.existsSync(storagePath)).toBe(true);

    const delRes = await req(`/api/media/${media1.id}`, aliceCookie, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(204);
    expect(fs.existsSync(storagePath)).toBe(false);
    expect((await req(`/api/media/${media1.id}`, aliceCookie)).status).toBe(404);
  });
});
