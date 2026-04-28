import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createFeatureFlagsRoute } = await import("./feature-flags.js");

function createApp(route: ReturnType<typeof createFeatureFlagsRoute>) {
  const app = new Hono();
  app.route("/feature-flags", route);
  return app;
}

test("GET /feature-flags returns the public modules flags", async () => {
  const app = createApp(createFeatureFlagsRoute({
    getModulesFeatureFlags: async () => ({
      agents: "live",
      images: "coming_soon",
      mobile_apps: "disabled",
      videos: "coming_soon",
      web_apps: "live",
      websites: "live",
    }),
  }));

  const response = await app.request("http://localhost/feature-flags");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    agents: "live",
    images: "coming_soon",
    mobile_apps: "disabled",
    videos: "coming_soon",
    web_apps: "live",
    websites: "live",
  });
});
