import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  STUDIO_ASSET_PROXY_BASE_URL,
  buildAssetProxyUrl,
  isStudioProxyableBucket,
} = await import("./studioAssetProxy.js");

test("buildAssetProxyUrl returns a beomz API proxy URL", () => {
  assert.equal(
    buildAssetProxyUrl("project-assets", "project-123/logo.png"),
    `${STUDIO_ASSET_PROXY_BASE_URL}?bucket=project-assets&path=project-123%2Flogo.png`,
  );
});

test("isStudioProxyableBucket only allows the known studio asset buckets", () => {
  assert.equal(isStudioProxyableBucket("project-assets"), true);
  assert.equal(isStudioProxyableBucket("chat-images"), true);
  assert.equal(isStudioProxyableBucket("avatars"), false);
});
