import assert from "node:assert/strict";
import test from "node:test";

const {
  provisionNeonProject,
  deleteNeonProject,
} = await import("./neonClient.js");

test("provisionNeonProject calls Neon API with expected payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalNeonApiKey = process.env.NEON_API_KEY;
  const originalNeonRegion = process.env.NEON_DEFAULT_REGION;
  process.env.NEON_API_KEY = "test-neon-key";
  process.env.NEON_DEFAULT_REGION = "aws-us-west-2";

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        project: { id: "neon-project-1" },
        connection_uris: [
          {
            connection_uri: "postgresql://user:pass@host/db",
            pooled_connection_uri: "postgresql://user:pass@pool/db",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await provisionNeonProject("beomz-project");
    assert.deepEqual(result, {
      neonProjectId: "neon-project-1",
      connectionUri: "postgresql://user:pass@host/db",
      pooledConnectionUri: "postgresql://user:pass@pool/db",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://console.neon.tech/api/v2/projects");
    assert.equal(calls[0]?.init?.method, "POST");

    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-neon-key");
    assert.equal(headers["Content-Type"], "application/json");

    const body = JSON.parse(String(calls[0]?.init?.body));
    assert.deepEqual(body, {
      project: {
        name: "beomz-project",
        region_id: "aws-us-west-2",
        pg_version: 17,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNeonApiKey === undefined) {
      delete process.env.NEON_API_KEY;
    } else {
      process.env.NEON_API_KEY = originalNeonApiKey;
    }
    if (originalNeonRegion === undefined) {
      delete process.env.NEON_DEFAULT_REGION;
    } else {
      process.env.NEON_DEFAULT_REGION = originalNeonRegion;
    }
  }
});

test("deleteNeonProject sends DELETE and ignores 404", async () => {
  const originalFetch = globalThis.fetch;
  const originalNeonApiKey = process.env.NEON_API_KEY;
  process.env.NEON_API_KEY = "test-neon-key";

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response("", { status: 404 });
  }) as typeof fetch;

  try {
    await deleteNeonProject("neon-project-404");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://console.neon.tech/api/v2/projects/neon-project-404");
    assert.equal(calls[0]?.init?.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNeonApiKey === undefined) {
      delete process.env.NEON_API_KEY;
    } else {
      process.env.NEON_API_KEY = originalNeonApiKey;
    }
  }
});
