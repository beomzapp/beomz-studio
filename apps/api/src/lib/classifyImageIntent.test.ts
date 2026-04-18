import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { classifyImageIntent } = await import("./classifyImageIntent.js");

test("classifyImageIntent falls back to general intent on timeout", async () => {
  const result = await classifyImageIntent(
    {
      imageUrl: "https://example.com/reference.png",
      userText: "here's an image",
    },
    {
      invokeModel: async () => await new Promise<string>(() => {}),
      timeoutMs: 10,
    },
  );

  assert.deepEqual(result, {
    intent: "general",
    confidence: 0,
    description: "I can see an image",
  });
});

test("classifyImageIntent honors text-first override for fix this", async () => {
  const result = await classifyImageIntent(
    {
      imageUrl: "https://example.com/logo.png",
      userText: "fix this",
    },
    {
      invokeModel: async () => JSON.stringify({
        intent: "logo",
        confidence: 0.38,
        description: "A simple brand mark on a white background.",
      }),
      timeoutMs: 50,
    },
  );

  assert.equal(result.intent, "error");
  assert.equal(result.description, "A simple brand mark on a white background.");
  assert.equal(result.confidence, 0.95);
});
