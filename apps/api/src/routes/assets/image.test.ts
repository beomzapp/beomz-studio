import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createAssetImageRoute } = await import("./image.js");

test("asset image proxy rejects unknown buckets", async () => {
  const route = createAssetImageRoute();
  const response = await route.request("http://localhost/?bucket=avatars&path=file.png");

  assert.equal(response.status, 400);
  assert.match(await response.text(), /Invalid bucket/i);
});

test("asset image proxy returns a COEP-safe image response", async () => {
  const route = createAssetImageRoute({
    downloadAsset: async () => ({
      body: Buffer.from("png").buffer,
      contentType: "image/png",
    }),
  });

  const response = await route.request("http://localhost/?bucket=project-assets&path=project-123%2Flogo.png");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});
