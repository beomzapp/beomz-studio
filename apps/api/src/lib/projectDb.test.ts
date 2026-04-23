import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectDbLimitsRow, ProjectRow } from "@beomz-studio/studio-db";

process.env.STUDIO_SUPABASE_URL ??= "https://example.supabase.co";
process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const {
  buildProjectDatabaseEnvVars,
  getProjectSupabaseConfig,
  parsePostgresConnectionString,
  parseSupabaseProjectUrl,
  resolveProjectDbProvider,
} = await import("./projectDb.js");

function createProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  const now = new Date().toISOString();
  return {
    id: "project-1",
    org_id: "org-1",
    name: "Test Project",
    template: "blank",
    status: "ready",
    icon: null,
    created_at: now,
    updated_at: now,
    last_opened_at: null,
    database_enabled: true,
    db_schema: null,
    db_nonce: null,
    db_provider: "neon",
    db_config: null,
    db_wired: true,
    thumbnail_url: null,
    published: false,
    published_slug: null,
    published_at: null,
    beomz_app_url: null,
    beomz_app_deployed_at: null,
    build_phases: null,
    current_phase: 0,
    phases_total: 0,
    phase_mode: false,
    ...overrides,
  };
}

function createLimits(overrides: Partial<ProjectDbLimitsRow> = {}): ProjectDbLimitsRow {
  const now = new Date().toISOString();
  return {
    id: "limits-1",
    project_id: "project-1",
    plan_storage_mb: 100,
    plan_rows: 1000,
    tables_limit: 20,
    extra_storage_mb: 0,
    extra_rows: 0,
    neon_project_id: null,
    neon_branch_id: null,
    db_url: "postgresql://user:pass@managed.neon.tech/neondb",
    neon_auth_base_url: "https://auth.example.com",
    neon_auth_pub_key: "pub-key",
    neon_auth_secret_key: "secret-key",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

test("parsePostgresConnectionString accepts postgres URLs and returns host", () => {
  const parsed = parsePostgresConnectionString("postgresql://user:pass@db.example.com:5432/app");
  assert.equal(parsed.host, "db.example.com");
  assert.equal(parsed.connectionString, "postgresql://user:pass@db.example.com:5432/app");
});

test("parsePostgresConnectionString rejects invalid schemes", () => {
  assert.throws(
    () => parsePostgresConnectionString("mysql://user:pass@db.example.com/app"),
    /must start with postgres:\/\/ or postgresql:\/\//,
  );
});

test("parseSupabaseProjectUrl accepts Supabase project URLs and returns host", () => {
  const parsed = parseSupabaseProjectUrl("https://demo-project.supabase.co");
  assert.equal(parsed.host, "demo-project.supabase.co");
  assert.equal(parsed.supabaseUrl, "https://demo-project.supabase.co");
});

test("parseSupabaseProjectUrl rejects invalid hosts", () => {
  assert.throws(
    () => parseSupabaseProjectUrl("https://example.com"),
    /must contain \.supabase\.co/,
  );
});

test("resolveProjectDbProvider prefers BYO Supabase when BYO credentials are set", () => {
  const provider = resolveProjectDbProvider(
    createProject({
      db_provider: "beomz",
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    }),
    createLimits(),
  );

  assert.equal(provider, "supabase");
});

test("resolveProjectDbProvider prefers legacy BYO postgres when byo_db_url is a connection string", () => {
  const provider = resolveProjectDbProvider(
    createProject({
      db_provider: "beomz",
      byo_db_url: "postgresql://user:pass@db.example.com/app",
    }),
    createLimits(),
  );

  assert.equal(provider, "postgres");
});

test("getProjectSupabaseConfig prefers BYO Supabase credentials over db_config", () => {
  const config = getProjectSupabaseConfig(
    createProject({
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
      db_config: {
        url: "https://legacy-project.supabase.co",
        anonKey: "legacy-key",
        dbSchema: "custom",
      },
    }),
  );

  assert.deepEqual(config, {
    supabaseUrl: "https://demo-project.supabase.co",
    supabaseAnonKey: "anon-key",
    host: "demo-project.supabase.co",
    dbSchema: "public",
    source: "byo",
  });
});

test("getProjectSupabaseConfig falls back to db_config Supabase credentials", () => {
  const config = getProjectSupabaseConfig(
    createProject({
      byo_db_url: null,
      byo_db_anon_key: null,
      db_provider: "supabase",
      db_config: {
        url: "https://legacy-project.supabase.co",
        anonKey: "legacy-key",
        dbSchema: "custom",
      },
    }),
  );

  assert.deepEqual(config, {
    supabaseUrl: "https://legacy-project.supabase.co",
    supabaseAnonKey: "legacy-key",
    host: "legacy-project.supabase.co",
    dbSchema: "custom",
    source: "db_config",
  });
});

test("buildProjectDatabaseEnvVars returns BYO Supabase env vars and clears Neon/Postgres vars", () => {
  const envVars = buildProjectDatabaseEnvVars(
    createProject({
      db_provider: "beomz",
      database_enabled: false,
      db_wired: false,
      byo_db_url: "https://demo-project.supabase.co",
      byo_db_anon_key: "anon-key",
    }),
    createLimits(),
  );

  assert.deepEqual(envVars, {
    VITE_SUPABASE_URL: "https://demo-project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon-key",
    VITE_BYO_DB: "true",
    VITE_DATABASE_URL: null,
    VITE_DB_SCHEMA: null,
    VITE_NEON_AUTH_URL: null,
    NEON_AUTH_SECRET: null,
    NEON_AUTH_PUB_KEY: null,
  });
});

test("buildProjectDatabaseEnvVars returns legacy BYO postgres env vars and clears Neon auth vars", () => {
  const envVars = buildProjectDatabaseEnvVars(
    createProject({
      db_provider: "postgres",
      byo_db_url: "postgresql://user:pass@db.example.com/app",
    }),
    createLimits(),
  );

  assert.deepEqual(envVars, {
    VITE_BYO_DB: "true",
    VITE_DATABASE_URL: "postgresql://user:pass@db.example.com/app",
    VITE_DB_SCHEMA: null,
    VITE_SUPABASE_URL: null,
    VITE_SUPABASE_ANON_KEY: null,
    VITE_NEON_AUTH_URL: null,
    NEON_AUTH_SECRET: null,
    NEON_AUTH_PUB_KEY: null,
  });
});

test("buildProjectDatabaseEnvVars keeps managed Neon auth vars and clears BYO flag", () => {
  const envVars = buildProjectDatabaseEnvVars(createProject(), createLimits());

  assert.deepEqual(envVars, {
    VITE_DATABASE_URL: "postgresql://user:pass@managed.neon.tech/neondb",
    VITE_BYO_DB: null,
    VITE_DB_SCHEMA: null,
    VITE_SUPABASE_URL: null,
    VITE_SUPABASE_ANON_KEY: null,
    VITE_NEON_AUTH_URL: "https://auth.example.com",
    NEON_AUTH_SECRET: "secret-key",
    NEON_AUTH_PUB_KEY: "pub-key",
  });
});
