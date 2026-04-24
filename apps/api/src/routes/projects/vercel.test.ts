import assert from "node:assert/strict";
import test from "node:test";

process.env.ANTHROPIC_API_KEY ??= "test-anthropic-key";
process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  injectNeonEnvVars,
  resolveDeploySupabaseCredentials,
  replaceDeployEnvFile,
} = await import("./vercel.js");

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

test("resolveDeploySupabaseCredentials prefers BYO Supabase credentials before placeholder injection", () => {
  const config = resolveDeploySupabaseCredentials(
    {
      db_wired: false,
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    },
    {
      managedUrl: "https://managed.supabase.co",
      managedAnonKey: "managed-anon-key",
    },
  );

  assert.deepEqual(config, {
    supabaseUrl: "https://demo-project.supabase.co",
    supabaseAnonKey: "anon-key",
    dbSchema: "public",
    source: "byo",
  });
});

test("resolveDeploySupabaseCredentials falls back to placeholders when no BYO or managed config exists", () => {
  const config = resolveDeploySupabaseCredentials(
    {
      db_wired: false,
      byo_db_url: null,
      byo_db_anon_key: null,
    },
    {
      managedUrl: null,
      managedAnonKey: null,
    },
  );

  assert.deepEqual(config, {
    supabaseUrl: "https://placeholder.supabase.co",
    supabaseAnonKey: "placeholder",
    dbSchema: "public",
    source: "placeholder",
  });
});

test("replaceDeployEnvFile overwrites src/.env.local with BYO Supabase credentials", () => {
  const next = replaceDeployEnvFile(
    [
      {
        filename: "src/App.tsx",
        content: "export default function App() { return null; }\n",
      },
      {
        filename: "src/.env.local",
        content: [
          "VITE_SUPABASE_URL=https://placeholder.supabase.co",
          "VITE_SUPABASE_ANON_KEY=placeholder",
          "VITE_DATABASE_URL=postgresql://user:pass@host/db",
        ].join("\n"),
      },
    ],
    {
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    },
    {
      provider: "neon",
      neonDbUrl: "postgresql://user:pass@managed.neon.tech/neondb",
    },
  );

  const envFiles = next.filter((file) => file.filename === "src/.env.local");
  assert.equal(envFiles.length, 1);
  assert.equal(
    envFiles[0]?.content,
    [
      "VITE_SUPABASE_URL=https://demo-project.supabase.co",
      "VITE_SUPABASE_ANON_KEY=anon-key",
      "VITE_BYO_DB=true",
      "",
    ].join("\n"),
  );
});

test("replaceDeployEnvFile adds src/.env.local for managed Neon deploys", () => {
  const next = replaceDeployEnvFile(
    [
      {
        filename: "src/App.tsx",
        content: "export default function App() { return null; }\n",
      },
    ],
    {},
    {
      provider: "neon",
      neonDbUrl: "postgresql://user:pass@managed.neon.tech/neondb",
    },
  );

  const envFiles = next.filter((file) => file.filename === "src/.env.local");
  assert.equal(envFiles.length, 1);
  assert.equal(
    envFiles[0]?.content,
    "VITE_DATABASE_URL=postgresql://user:pass@managed.neon.tech/neondb\n",
  );
});
