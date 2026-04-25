import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after } from "node:test";
import test from "node:test";

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error("Skip outbound Anthropic calls in unit tests.");
}) as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

const { classifyIntent } = await import("./intentClassifier.js");

test("classifyIntent hard-blocks short messages as greeting", async () => {
  const result = await classifyIntent("hi", true, false);

  assert.equal(result.intent, "greeting");
  assert.match(result.reason, /hard-coded short-message greeting rule/i);
});

test("classifyIntent hard-blocks acknowledgement words as greeting", async () => {
  const result = await classifyIntent("thanks", true, false);

  assert.equal(result.intent, "greeting");
  assert.match(result.reason, /hard-coded/i);
});

test("classifyIntent treats image-only messages as image_ref", async () => {
  const result = await classifyIntent("", true, true);

  assert.equal(result.intent, "image_ref");
  assert.match(result.reason, /image-only/i);
});

test("classifyIntent routes image-attached edit prompts straight to iteration", async () => {
  const result = await classifyIntent("use this as the logo", true, true);

  assert.equal(result.intent, "iteration");
  assert.equal(result.confidence, 0.95);
  assert.match(result.reason, /image-attached edit/i);
});

test("classifyIntent routes image-attached new build prompts to image_ref", async () => {
  const result = await classifyIntent("build around this visual", false, true);

  assert.equal(result.intent, "image_ref");
  assert.equal(result.confidence, 0.95);
  assert.match(result.reason, /image-attached reference/i);
});

test("classifyIntent fallback detects research from URL-like content", async () => {
  const result = await classifyIntent("research https://mybos.com", false, false);

  assert.equal(result.intent, "research");
});

test("classifyIntent fallback detects question wording", async () => {
  const result = await classifyIntent("what does this app do", false, false);

  assert.equal(result.intent, "question");
});

test("classifyIntent fallback prefers iteration when existing files are present", async () => {
  const result = await classifyIntent("change the button color", true, false);

  assert.equal(result.intent, "iteration");
});

test("classifyIntent fallback detects ambiguous requests", async () => {
  const result = await classifyIntent("make it better", true, false);

  assert.equal(result.intent, "ambiguous");
});

test("classifyIntent fallback prefers build_new when no files exist", async () => {
  const result = await classifyIntent("build a todo app", false, false);

  assert.equal(result.intent, "build_new");
  assert.equal(result.confidence, 0.85);
});

test("classifyIntent fallback scores store website briefs around 0.65", async () => {
  const result = await classifyIntent(
    "a pet store website with landing page and shop to buy stuff",
    false,
    false,
  );

  assert.equal(result.intent, "build_new");
  assert.equal(result.confidence, 0.65);
});

test("classifyIntent fallback keeps vague build requests low confidence", async () => {
  const result = await classifyIntent("i want to build something", false, false);

  assert.equal(result.intent, "build_new");
  assert.equal(result.confidence, 0.3);
});

test("intentClassifier prompt includes the more generous rubric examples", async () => {
  const source = await readFile(new URL("./intentClassifier.ts", import.meta.url), "utf8");

  assert.match(source, /\+0\.4/);
  assert.match(source, /\+0\.25/);
  assert.match(source, /\+0\.15/);
  assert.match(source, /pet store website with landing page and shop to buy stuff/i);
  assert.match(source, /build me a todo app/i);
  assert.match(source, /i want to build something/i);
});
