import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  PROJECT_ASSETS_BUCKET,
  STUDIO_SERVICE_ROLE_ENV_VAR,
  buildProjectAssetPublicUrl,
  createProjectAssetPath,
  projectAssetExtensionForMediaType,
} = await import("./uploadProjectAsset.js");

test("projectAssetExtensionForMediaType derives stable extensions", () => {
  assert.equal(projectAssetExtensionForMediaType("image/png"), "png");
  assert.equal(projectAssetExtensionForMediaType("image/jpeg"), "jpg");
  assert.equal(projectAssetExtensionForMediaType("image/jpg"), "jpg");
  assert.equal(projectAssetExtensionForMediaType("image/webp"), "webp");
  assert.equal(projectAssetExtensionForMediaType("image/gif"), "gif");
});

test("createProjectAssetPath uses projectId and derived extension", () => {
  assert.equal(
    createProjectAssetPath("project-123", "image/png", "asset-456"),
    "project-123/asset-456.png",
  );
});

test("buildProjectAssetPublicUrl returns the expected public storage URL", () => {
  assert.equal(
    buildProjectAssetPublicUrl("project-123/asset-456.png"),
    `https://beomz.ai/api/assets/image?bucket=${PROJECT_ASSETS_BUCKET}&path=project-123%2Fasset-456.png`,
  );
});

test("uploadProjectAsset uses the studio service role env var name", () => {
  assert.equal(STUDIO_SERVICE_ROLE_ENV_VAR, "STUDIO_SUPABASE_SERVICE_ROLE_KEY");
});
