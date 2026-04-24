import assert from "node:assert/strict";
import test from "node:test";

import type { StudioFile } from "@beomz-studio/contracts";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  buildPublishedDbCredentials,
  injectPublishedByoEnvFiles,
} = await import("./publish.js");

test("buildPublishedDbCredentials returns BYO Supabase creds for published BYO projects", () => {
  const dbCredentials = buildPublishedDbCredentials({
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
    db_wired: true,
    db_schema: "app_test_schema",
  });

  assert.deepEqual(dbCredentials, {
    supabaseUrl: "https://demo-project.supabase.co",
    supabaseAnonKey: "anon-key",
    schemaName: "public",
    VITE_SUPABASE_URL: "https://demo-project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon-key",
    VITE_BYO_DB: "true",
  });
  assert.equal("byo_db_service_key" in (dbCredentials ?? {}), false);
});

test("buildPublishedDbCredentials keeps managed publish credentials unchanged", () => {
  process.env.USER_DATA_SUPABASE_URL = "https://managed.supabase.co";
  process.env.USER_DATA_SUPABASE_ANON_KEY = "managed-anon-key";

  const dbCredentials = buildPublishedDbCredentials({
    db_wired: true,
    db_schema: "app_test_schema",
  });

  assert.deepEqual(dbCredentials, {
    supabaseUrl: "https://managed.supabase.co",
    supabaseAnonKey: "managed-anon-key",
    schemaName: "app_test_schema",
  });
});

test("injectPublishedByoEnvFiles writes BYO Supabase env vars into exported .env.local", () => {
  const files: readonly StudioFile[] = [
    {
      path: "src/App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return <div>Hello</div>; }\n",
      source: "ai",
      locked: false,
    },
    {
      path: ".env.local",
      kind: "config",
      language: "dotenv",
      content: [
        "KEEP_ME=yes",
        "VITE_DATABASE_URL=postgresql://user:pass@host/db",
        "NEON_AUTH_SECRET=secret-key",
      ].join("\n"),
      source: "ai",
      locked: false,
    },
  ];

  const next = injectPublishedByoEnvFiles(files, {
    byo_db_url: "https://demo-project.supabase.co",
    byo_db_anon_key: "anon-key",
  });

  const envFile = next.find((file) => file.path === ".env.local");
  assert.ok(envFile);
  assert.match(envFile.content, /KEEP_ME=yes/);
  assert.match(envFile.content, /VITE_SUPABASE_URL=https:\/\/demo-project\.supabase\.co/);
  assert.match(envFile.content, /VITE_SUPABASE_ANON_KEY=anon-key/);
  assert.match(envFile.content, /VITE_BYO_DB=true/);
  assert.doesNotMatch(envFile.content, /VITE_DATABASE_URL=/);
  assert.doesNotMatch(envFile.content, /NEON_AUTH_SECRET=/);
});

test("injectPublishedByoEnvFiles leaves non-BYO export files unchanged", () => {
  const files: readonly StudioFile[] = [
    {
      path: "src/App.tsx",
      kind: "route",
      language: "tsx",
      content: "export default function App() { return <div>Hello</div>; }\n",
      source: "ai",
      locked: false,
    },
  ];

  const next = injectPublishedByoEnvFiles(files, {
    db_wired: true,
    db_schema: "app_test_schema",
  });

  assert.deepEqual(next, files);
});
