import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.FAL_KEY ??= "test-fal-key";

const { createImagesGenerateRoute } = await import("./generate.js");

function createApp(route: ReturnType<typeof createImagesGenerateRoute>) {
  const app = new Hono();
  app.route("/api/images", route);
  return app;
}

test("POST /api/images/generate proxies fal image generation and returns the URL", async () => {
  let captured: { prompt: string; width?: number; height?: number } | null = null;
  const app = createApp(createImagesGenerateRoute({
    generateImageUrl: async (input) => {
      captured = {
        prompt: input.prompt,
        width: input.width,
        height: input.height,
      };
      return "https://cdn.fal.ai/generated/hero.jpg";
    },
  }));

  const response = await app.request("http://localhost/api/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "modern fitness dashboard hero, clean, vibrant",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: "https://cdn.fal.ai/generated/hero.jpg",
  });
  assert.deepEqual(captured, {
    prompt: "modern fitness dashboard hero, clean, vibrant",
    width: undefined,
    height: undefined,
  });
});

test("POST /api/images/generate validates the request body", async () => {
  const app = createApp(createImagesGenerateRoute({
    generateImageUrl: async () => "https://cdn.fal.ai/generated/hero.jpg",
  }));

  const response = await app.request("http://localhost/api/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "",
      width: 0,
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "prompt is required; width and height must be positive integers up to 4096.",
  });
});

test("POST /api/images/generate surfaces upstream fal failures", async () => {
  const app = createApp(createImagesGenerateRoute({
    generateImageUrl: async () => {
      throw new Error("fal.ai image request failed: 500 Internal Server Error");
    },
  }));

  const response = await app.request("http://localhost/api/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "studio illustration",
      width: 1920,
      height: 1080,
    }),
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "fal.ai image request failed: 500 Internal Server Error",
  });
});
