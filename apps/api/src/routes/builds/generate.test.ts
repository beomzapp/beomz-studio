import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.PORT ??= "3001";

const {
  buildIterationSystemPrompt,
  buildSystemPrompt,
} = await import("./generate.js");

const EXISTING_SUPABASE_RULE = "Do NOT create a new Supabase client file.";

test("iteration system prompt injects the existing Supabase client rule when db_wired=true", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, true);

  assert.match(prompt, /Do NOT create a new Supabase client file\./);
  assert.match(prompt, /Do NOT generate any file named supabase-js, supabase-client, supabase-helper/);
});

test("iteration system prompt does not inject the existing Supabase client rule when db_wired=false", () => {
  const prompt = buildIterationSystemPrompt(undefined, undefined, false);

  assert.equal(prompt.includes(EXISTING_SUPABASE_RULE), false);
});

test("initial build system prompt does not inject the existing Supabase client rule", () => {
  const prompt = buildSystemPrompt("professional-blue");

  assert.equal(prompt.includes(EXISTING_SUPABASE_RULE), false);
});
