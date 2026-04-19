import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { injectNeonEnvVars } = await import("./vercel.js");

test("injectNeonEnvVars inlines VITE_DATABASE_URL for published Neon apps", () => {
  const input = [
    "import { neon } from '@neondatabase/serverless';",
    "const sql = neon(import.meta.env.VITE_DATABASE_URL);",
  ].join("\n");

  const output = injectNeonEnvVars(input, "postgresql://user:pass@host/db");

  assert.equal(output.includes("import.meta.env.VITE_DATABASE_URL"), false);
  assert.match(output, /neon\("postgresql:\/\/user:pass@host\/db"\)/);
});

test("injectNeonEnvVars replaces repeated VITE_DATABASE_URL references", () => {
  const input = [
    "const primary = import.meta.env.VITE_DATABASE_URL;",
    "const backup = import.meta.env.VITE_DATABASE_URL;",
  ].join("\n");

  const output = injectNeonEnvVars(input, "postgresql://user:pass@host/db");

  assert.equal(output.includes("import.meta.env.VITE_DATABASE_URL"), false);
  assert.match(output, /const primary = "postgresql:\/\/user:pass@host\/db";/);
  assert.match(output, /const backup = "postgresql:\/\/user:pass@host\/db";/);
});
