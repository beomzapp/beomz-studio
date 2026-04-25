import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { OrgContext } from "../../types.js";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { createBuildsUploadImageRoute } = await import("./upload-image.js");

function createTestOrgContext(projectId: string): OrgContext {
  return {
    db: {
      findProjectById: async (id: string) => (
        id === projectId
          ? { id: projectId, org_id: "org-1" }
          : null
      ),
    } as OrgContext["db"],
    jwt: { sub: "platform-user" },
    membership: { org_id: "org-1", role: "owner", user_id: "user-1", created_at: new Date().toISOString() },
    org: {
      id: "org-1",
      owner_id: "user-1",
      name: "Test Org",
      plan: "free",
      credits: 0,
      topup_credits: 0,
      monthly_credits: 0,
      rollover_credits: 0,
      rollover_cap: 0,
      credits_period_start: null,
      credits_period_end: null,
      downgrade_at_period_end: false,
      pending_plan: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      daily_reset_at: null,
      created_at: new Date().toISOString(),
    },
    user: {
      id: "user-1",
      email: "omar@example.com",
      platform_user_id: "platform-user",
      created_at: new Date().toISOString(),
    },
  };
}

function createRoute(projectId: string, uploadImage?: (typeof import("../../lib/chatImageStorage.js"))["uploadChatImage"]) {
  return createBuildsUploadImageRoute({
    authMiddleware: async (_c, next) => {
      await next();
    },
    loadOrgContextMiddleware: async (c, next) => {
      c.set("orgContext", createTestOrgContext(projectId));
      await next();
    },
    now: () => 1_746_000_000_000,
    uploadImage,
  });
}

test("upload-image rejects files larger than 10MB", async () => {
  const projectId = randomUUID();
  const route = createRoute(projectId);
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set(
    "image",
    new File([Buffer.alloc(10 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" }),
  );

  const response = await route.request("http://localhost/", {
    method: "POST",
    body: formData,
  });

  assert.equal(response.status, 413);
  assert.match(await response.text(), /10MB or smaller/i);
});

test("upload-image rejects non-image mime types", async () => {
  const projectId = randomUUID();
  const route = createRoute(projectId);
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("image", new File(["not an image"], "notes.txt", { type: "text/plain" }));

  const response = await route.request("http://localhost/", {
    method: "POST",
    body: formData,
  });

  assert.equal(response.status, 415);
  assert.match(await response.text(), /Only image uploads are supported/i);
});

test("upload-image returns a beomz proxy URL on success", async () => {
  const projectId = randomUUID();
  const route = createRoute(projectId, async () => ({
    path: `${projectId}/session/1746000000000.png`,
    url: "https://storage.example.com/signed/chat-image",
  }));
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("image", new File([Buffer.from("png")], "logo.png", { type: "image/png" }));

  const response = await route.request("http://localhost/", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json() as { url: string };

  assert.equal(response.status, 200);
  assert.equal(
    payload.url,
    `https://beomz.ai/api/assets/image?bucket=chat-images&path=${encodeURIComponent(`${projectId}/session/1746000000000.png`)}`,
  );
});
