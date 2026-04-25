import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.VERCEL_TOKEN ??= "vercel-token";
process.env.VERCEL_PROJECT_ID ??= "prj_123";
process.env.VERCEL_TEAM_ID ??= "team_123";

const {
  addProjectDomain,
  addDomainToProjectRecord,
  detectRegistrar,
  getFriendlyVercelErrorMessage,
  listProjectDomains,
  normalizeCustomDomain,
  removeAllProjectDomains,
  readProjectCustomDomains,
  removeDomainFromProjectRecord,
  VercelApiError,
} = await import("./vercelDomains.js");

test("normalizeCustomDomain accepts plain hostnames and rejects malformed input", () => {
  assert.equal(normalizeCustomDomain(" MyApp.COM "), "myapp.com");
  assert.equal(normalizeCustomDomain("app.myapp.com."), "app.myapp.com");
  assert.equal(normalizeCustomDomain("https://myapp.com"), null);
  assert.equal(normalizeCustomDomain("myapp"), null);
  assert.equal(normalizeCustomDomain("my_app.com"), null);
});

test("custom domain project record helpers dedupe and remove normalized domains", () => {
  const current = {
    custom_domains: ["MyApp.com", "app.myapp.com", "app.myapp.com", "invalid domain"],
  };

  assert.deepEqual(readProjectCustomDomains(current), ["myapp.com", "app.myapp.com"]);
  assert.deepEqual(addDomainToProjectRecord(current, "newapp.com"), ["myapp.com", "app.myapp.com", "newapp.com"]);
  assert.deepEqual(removeDomainFromProjectRecord(current, "app.myapp.com"), ["myapp.com"]);
});

test("getFriendlyVercelErrorMessage maps Vercel status codes to UI-safe copy", () => {
  assert.equal(getFriendlyVercelErrorMessage(409), "This domain is already in use on another project.");
  assert.equal(getFriendlyVercelErrorMessage(400), "Invalid domain name. Please check and try again.");
  assert.equal(getFriendlyVercelErrorMessage(403), "Domain not allowed. Please try a different domain.");
  assert.equal(getFriendlyVercelErrorMessage(402), "Payment required. Please check your Vercel account.");
  assert.equal(getFriendlyVercelErrorMessage(500), "Failed to add domain. Please try again.");
});

test("detectRegistrar maps RDAP registrar entities to known registrar docs", async () => {
  const result = await detectRegistrar(
    "myapp.com",
    async () => new Response(JSON.stringify({
      entities: [
        {
          roles: ["registrar"],
          vcardArray: ["vcard", [
            ["version", {}, "text", "4.0"],
            ["fn", {}, "text", "NAMECHEAP INC"],
          ]],
        },
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  assert.deepEqual(result, {
    registrar: "Namecheap",
    docsUrl: "https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/",
  });
});

test("detectRegistrar never throws and falls back to nulls when RDAP fails", async () => {
  const result = await detectRegistrar(
    "myapp.com",
    async () => {
      throw new Error("RDAP unavailable");
    },
  );

  assert.deepEqual(result, {
    registrar: null,
    docsUrl: null,
  });
});

test("addProjectDomain retries after conflict by removing the existing domain from the configured project", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const result = await addProjectDomain(
    "myapp.com",
    async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });

      if (method === "POST" && url === "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123") {
        const addCallCount = calls.filter((call) => call.method === "POST" && call.url === url).length;
        if (addCallCount === 1) {
          return new Response(JSON.stringify({
            error: {
              code: "domain_in_use",
              message: "Domain already exists",
            },
          }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          name: "myapp.com",
          apexName: "myapp.com",
          projectId: "prj_123",
          verified: false,
          verification: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "GET" && url === "https://rdap.org/domain/myapp.com") {
        return new Response(JSON.stringify({
          entities: [
            {
              roles: ["registrar"],
              vcardArray: ["vcard", [
                ["fn", {}, "text", "NAMECHEAP INC"],
              ]],
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (method === "DELETE" && url === "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123") {
        return new Response(null, { status: 404 });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    },
  );

  assert.equal(result.name, "myapp.com");
  assert.equal(result.registrar, "Namecheap");
  assert.equal(result.docsUrl, "https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/");
  assert.deepEqual(calls, [
    {
      url: "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123",
      method: "POST",
    },
    {
      url: "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123",
      method: "DELETE",
    },
    {
      url: "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123",
      method: "POST",
    },
    {
      url: "https://rdap.org/domain/myapp.com",
      method: "GET",
    },
  ]);
});

test("addProjectDomain throws a friendly conflict error when Vercel still returns 409 after retry", async () => {
  await assert.rejects(
    () => addProjectDomain(
      "myapp.com",
      async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (method === "POST" && url === "https://api.vercel.com/v10/projects/prj_123/domains?teamId=team_123") {
          return new Response(JSON.stringify({
            error: {
              code: "domain_in_use",
              message: "Domain already exists",
            },
          }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "DELETE" && url === "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123") {
          return new Response(null, { status: 404 });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof VercelApiError);
      assert.equal(error.status, 409);
      assert.equal(error.friendlyMessage, "This domain is already in use on another project.");
      assert.equal(error.code, "domain_in_use");
      return true;
    },
  );
});

test("listProjectDomains returns verification details for unverified domains", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const result = await listProjectDomains(
    {
      custom_domains: ["myapp.com", "docs.myapp.com"],
    },
    async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });

      if (url === "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123") {
        return new Response(JSON.stringify({
          name: "myapp.com",
          apexName: "myapp.com",
          projectId: "prj_123",
          verified: false,
          verification: [{ type: "TXT", domain: "_vercel.myapp.com", value: "challenge", reason: "ownership" }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://api.vercel.com/v9/projects/prj_123/domains/docs.myapp.com?teamId=team_123") {
        return new Response(JSON.stringify({
          name: "docs.myapp.com",
          apexName: "myapp.com",
          projectId: "prj_123",
          verified: true,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://rdap.org/domain/myapp.com") {
        return new Response(JSON.stringify({
          entities: [
            {
              roles: ["registrar"],
              vcardArray: ["vcard", [
                ["fn", {}, "text", "GODADDY.COM, LLC"],
              ]],
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    },
  );

  assert.deepEqual(result, [
    {
      domain: "myapp.com",
      verified: false,
      verification: [{ type: "TXT", domain: "_vercel.myapp.com", value: "challenge", reason: "ownership" }],
      registrar: "GoDaddy",
      docsUrl: "https://www.godaddy.com/help/manage-dns-records-680",
    },
    {
      domain: "docs.myapp.com",
      verified: true,
      verification: [],
      registrar: "GoDaddy",
      docsUrl: "https://www.godaddy.com/help/manage-dns-records-680",
    },
  ]);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    [...calls].sort((left, right) => left.url.localeCompare(right.url)),
    [
      {
        url: "https://api.vercel.com/v9/projects/prj_123/domains/docs.myapp.com?teamId=team_123",
        method: "GET",
      },
      {
        url: "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123",
        method: "GET",
      },
      {
        url: "https://rdap.org/domain/myapp.com",
        method: "GET",
      },
    ],
  );
});

test("removeAllProjectDomains removes each normalized domain once", async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  await removeAllProjectDomains(
    ["MyApp.com", "docs.myapp.com", "myapp.com", "invalid domain"],
    async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
      });
      return new Response(null, { status: 200 });
    },
  );

  assert.deepEqual(calls, [
    {
      url: "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123",
      method: "DELETE",
    },
    {
      url: "https://api.vercel.com/v9/projects/prj_123/domains/docs.myapp.com?teamId=team_123",
      method: "DELETE",
    },
  ]);
});

test("removeAllProjectDomains continues when one domain delete fails", async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  await removeAllProjectDomains(
    ["myapp.com", "docs.myapp.com"],
    async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
      });

      if (url === "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123") {
        return new Response("boom", { status: 500 });
      }

      return new Response(null, { status: 200 });
    },
  );

  assert.deepEqual(calls, [
    {
      url: "https://api.vercel.com/v9/projects/prj_123/domains/myapp.com?teamId=team_123",
      method: "DELETE",
    },
    {
      url: "https://api.vercel.com/v9/projects/prj_123/domains/docs.myapp.com?teamId=team_123",
      method: "DELETE",
    },
  ]);
});
