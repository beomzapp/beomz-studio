import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.VERCEL_TOKEN ??= "vercel-token";
process.env.VERCEL_PROJECT_ID ??= "prj_123";
process.env.VERCEL_TEAM_ID ??= "team_123";

const {
  addDomainToProjectRecord,
  normalizeCustomDomain,
  readProjectCustomDomains,
  removeDomainFromProjectRecord,
  resolveDeploymentIdForAlias,
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

test("resolveDeploymentIdForAlias picks the newest matching alias deployment", async () => {
  const calls: string[] = [];
  const deploymentId = await resolveDeploymentIdForAlias(
    "taskly.beomz.app",
    async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({
        aliases: [
          {
            alias: "taskly.beomz.app",
            deploymentId: "dpl_old",
            createdAt: 100,
            updatedAt: 100,
          },
          {
            alias: "taskly.beomz.app",
            deploymentId: "dpl_new",
            createdAt: 200,
            updatedAt: 250,
          },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  assert.equal(deploymentId, "dpl_new");
  assert.equal(
    calls[0],
    "https://api.vercel.com/v4/aliases?teamId=team_123&projectId=prj_123&domain=taskly.beomz.app&limit=20",
  );
});
