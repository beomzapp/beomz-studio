import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { projectIterationOperation } from "@beomz-studio/operations";
import type { StudioFile, TemplateId } from "@beomz-studio/contracts";

import { apiConfig } from "../config.js";
import type { OrgContext } from "../types.js";
import { buildSupabaseSetupSqlFromFiles } from "./supabaseSetupSql.js";
import { runBuildInBackground } from "../routes/builds/generate.js";
import { decryptProjectSecret, encryptProjectSecret } from "./projectSecrets.js";
import {
  getSupabaseProjectRef,
  readStoredSupabaseToken,
  runSupabaseManagementQueryWithOAuth,
} from "./supabaseManagement.js";

const STUDIO_DB_SCHEMA_RELOAD_DELAY_MS = 750;
const AUTO_WIRE_BUILD_MODEL = "claude-sonnet-4-6";
const AUTO_WIRE_WAIT_TIMEOUT_MS = 60_000;
const AUTO_WIRE_WAIT_POLL_MS = 500;
const SUPABASE_MANAGEMENT_API_BASE = "https://api.supabase.com/v1";
const SUPABASE_MIGRATION_CRITICAL_PROMPT = [
  "CRITICAL — Supabase schema migrations:",
  "You MUST include ALL database schema changes in the migrations array.",
  "This includes EVERY change needed for your code to work:",
  "",
  "New tables:",
  '  "CREATE TABLE IF NOT EXISTS table_name (...)"',
  "",
  "New columns on existing tables:",
  '  "ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ"',
  '  "ALTER TABLE todos ADD COLUMN IF NOT EXISTS image_url TEXT"',
  "",
  "Storage buckets (REQUIRED whenever you use supabase.storage):",
  "  \"INSERT INTO storage.buckets (id, name, public) VALUES ('bucket-name', 'bucket-name', true) ON CONFLICT (id) DO NOTHING\"",
  "",
  "RULES:",
  "- Every SQL must be idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING)",
  "- If your code references a column → it MUST be in migrations",
  "- If your code uses supabase.storage → the bucket MUST be in migrations",
  "- Missing migrations = runtime errors for the user",
  "- Include ALL migrations even if you think they might already exist",
].join("\n");

export const AUTO_WIRE_SUPABASE_ITERATION_PROMPT = [
  "Rewire the entire app to use Supabase instead of hardcoded data.",
  "Use this exact import line, character for character:",
  'import { createClient } from "@supabase/supabase-js"',
  'The package name is "@supabase/supabase-js" — do NOT use "./supabase-js", "supabase-js", or any relative path.',
  "NEVER use fetch() to call Supabase under ANY circumstances.",
  "NEVER use raw fetch() to call Supabase REST endpoints directly.",
  "NEVER construct URLs like supabaseUrl + '/rest/v1/...'.",
  "NEVER construct URLs like `${supabaseUrl}/rest/v1/...`.",
  "ALWAYS use ONLY the supabase client:",
  "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)",
  "supabase.from('todos').select('*').order('created_at', { ascending: false })",
  "supabase.from('todos').insert({ title, completed: false })",
  "supabase.from('todos').update({ completed }).eq('id', id)",
  "supabase.from('todos').delete().eq('id', id)",
  "Use import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY.",
  "Replace all hardcoded arrays and sample data with real Supabase queries.",
  "Use useEffect + useState for data fetching with loading and error states.",
  "",
  SUPABASE_MIGRATION_CRITICAL_PROMPT,
].join("\n");

export const UPGRADE_TO_BYO_ITERATION_PROMPT = [
  "Rewire the entire app to use Supabase instead of Neon.",
  "Use this exact import line, character for character:",
  'import { createClient } from "@supabase/supabase-js"',
  'The package name is "@supabase/supabase-js" — do NOT use "./supabase-js", "supabase-js", or any relative path.',
  "NEVER use fetch() to call Supabase under ANY circumstances.",
  "NEVER use raw fetch() to call Supabase REST endpoints directly.",
  "NEVER construct URLs like supabaseUrl + '/rest/v1/...'.",
  "NEVER construct URLs like `${supabaseUrl}/rest/v1/...`.",
  "ALWAYS use ONLY the supabase client:",
  "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)",
  "supabase.from('todos').select('*').order('created_at', { ascending: false })",
  "supabase.from('todos').insert({ title, completed: false })",
  "supabase.from('todos').update({ completed }).eq('id', id)",
  "supabase.from('todos').delete().eq('id', id)",
  "Use import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY.",
  "Replace all Neon/postgres queries with Supabase queries.",
  "Use useEffect + useState with loading and error states.",
  "",
  SUPABASE_MIGRATION_CRITICAL_PROMPT,
].join("\n");

function getStudioProjectRef(): string {
  return new URL(apiConfig.STUDIO_SUPABASE_URL).hostname.split(".")[0] ?? "";
}

export async function ensureSupabaseProjectColumns(
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const managementKey = apiConfig.SUPABASE_MANAGEMENT_API_KEY?.trim();
  if (!managementKey) {
    return;
  }

  const response = await fetchFn(
    `${SUPABASE_MANAGEMENT_API_BASE}/projects/${getStudioProjectRef()}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementKey}`,
      },
      body: JSON.stringify({
        query: [
          "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS byo_db_anon_key TEXT;",
          "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS byo_db_service_key TEXT;",
          "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS supabase_oauth_access_token TEXT;",
          "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS supabase_oauth_refresh_token TEXT;",
        ].join("\n"),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to ensure Supabase OAuth columns (${response.status}): ${body}`);
  }
}

export async function updateProjectWithSchemaReloadRetry(
  orgContext: OrgContext,
  projectId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    await orgContext.db.updateProject(projectId, patch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/byo_db_anon_key|byo_db_service_key|supabase_oauth_access_token|supabase_oauth_refresh_token|schema cache/i
        .test(message)
    ) {
      throw error;
    }

    const dbWithSchemaReload = orgContext.db as OrgContext["db"] & {
      notifySchemaReload?: () => Promise<void>;
    };
    await dbWithSchemaReload.notifySchemaReload?.().catch(() => undefined);
    await delay(STUDIO_DB_SCHEMA_RELOAD_DELAY_MS);
    await orgContext.db.updateProject(projectId, patch);
  }
}

export async function queueSupabaseAutoWireIteration(
  orgContext: OrgContext,
  project: Awaited<ReturnType<OrgContext["db"]["findProjectById"]>>,
  projectId: string,
  prompt: string,
  existingFiles: readonly StudioFile[],
  runBuildInBackgroundFn: typeof runBuildInBackground,
): Promise<string> {
  if (!project) {
    throw new Error("Project not found");
  }

  const buildId = randomUUID();
  const requestedAt = new Date().toISOString();
  const operationId = projectIterationOperation.id;

  await orgContext.db.createGeneration({
    completed_at: null,
    error: null,
    files: [],
    id: buildId,
    metadata: {
      sourcePrompt: prompt,
      autoWire: "byo_supabase",
      builderTrace: {
        events: [
          {
            code: "build_queued",
            id: "1",
            message: "Supabase wiring queued.",
            operation: "iteration",
            timestamp: requestedAt,
            type: "status",
            phase: "queued",
          },
        ],
        lastEventId: "1",
        previewReady: false,
        fallbackReason: null,
        fallbackUsed: false,
      },
    },
    operation_id: operationId,
    output_paths: [],
    preview_entry_path: "/",
    project_id: projectId,
    prompt,
    started_at: requestedAt,
    status: "queued",
    summary: `Queued Supabase wiring for ${project.name}.`,
    template_id: project.template as TemplateId,
    warnings: [],
  });

  console.log("[projects] Supabase auto-wire iteration queued.", {
    buildId,
    projectId,
    prompt,
  });

  runBuildInBackgroundFn(
    {
      buildId,
      projectId,
      orgId: orgContext.org.id,
      userId: orgContext.user.id,
      userEmail: orgContext.user.email,
      prompt,
      sourcePrompt: prompt,
      templateId: project.template,
      model: AUTO_WIRE_BUILD_MODEL,
      requestedAt,
      operationId,
      isIteration: true,
      existingFiles,
      projectName: project.name,
    },
    orgContext.db,
  ).catch((error: unknown) => {
    console.error("[projects] Supabase auto-wire iteration failed:", {
      buildId,
      projectId,
      error,
    });
  });

  return buildId;
}

export function readSetupSqlFromMetadata(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return "";
  }

  const setupSql = (metadata as Record<string, unknown>).setupSql;
  return typeof setupSql === "string" ? setupSql : "";
}

export function readMigrationStatementsFromMetadata(metadata: unknown): string[] {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return [];
  }

  const migrations = (metadata as Record<string, unknown>).migrations;
  if (!Array.isArray(migrations)) {
    return [];
  }

  return migrations
    .filter((statement): statement is string => typeof statement === "string")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function waitForGenerationCompletion(
  db: OrgContext["db"],
  buildId: string,
): Promise<{
  files?: readonly StudioFile[];
  metadata?: Record<string, unknown> | null;
  status?: string | null;
} | null> {
  const dbWithFindGeneration = db as OrgContext["db"] & {
    findGenerationById?: (id: string) => Promise<{
      files?: readonly StudioFile[];
      metadata?: Record<string, unknown> | null;
      status?: string | null;
    } | null>;
  };

  if (!dbWithFindGeneration.findGenerationById) {
    return null;
  }

  const deadline = Date.now() + AUTO_WIRE_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const generation = await dbWithFindGeneration.findGenerationById(buildId).catch(() => null);
    if (generation && generation.status === "completed") {
      return generation;
    }
    if (generation && generation.status === "failed") {
      return generation;
    }
    await delay(AUTO_WIRE_WAIT_POLL_MS);
  }

  return dbWithFindGeneration.findGenerationById(buildId).catch(() => null);
}

export async function connectProjectToSupabase(
  input: {
    orgContext: OrgContext;
    project: Awaited<ReturnType<OrgContext["db"]["findProjectById"]>>;
    projectId: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    prompt: string;
    runBuildInBackgroundFn?: typeof runBuildInBackground;
    ensureSupabaseProjectColumnsFn?: typeof ensureSupabaseProjectColumns;
    extraProjectPatch?: Record<string, unknown>;
    serviceRoleKey?: string | null;
    oauthAccessToken?: string | null;
    oauthRefreshToken?: string | null;
    fetchFn?: typeof fetch;
  },
): Promise<{ host: string; wiring: true; setupSql?: string }> {
  const runBuildInBackgroundFn = input.runBuildInBackgroundFn ?? runBuildInBackground;
  const ensureSupabaseProjectColumnsFn =
    input.ensureSupabaseProjectColumnsFn ?? ensureSupabaseProjectColumns;
  const fetchFn = input.fetchFn ?? fetch;
  const host = new URL(input.supabaseUrl).hostname;
  const serviceRoleKey = input.serviceRoleKey
    ?? decryptProjectSecret((input.project as Record<string, unknown> | null)?.byo_db_service_key);
  let oauthAccessToken = readStoredSupabaseToken(
    input.oauthAccessToken
    ?? input.extraProjectPatch?.supabase_oauth_access_token
    ?? (input.project as Record<string, unknown> | null)?.supabase_oauth_access_token,
  );
  let oauthRefreshToken = readStoredSupabaseToken(
    input.oauthRefreshToken
    ?? input.extraProjectPatch?.supabase_oauth_refresh_token
    ?? (input.project as Record<string, unknown> | null)?.supabase_oauth_refresh_token,
  );
  const projectRef = getSupabaseProjectRef(input.supabaseUrl);

  await ensureSupabaseProjectColumnsFn(fetchFn);

  await updateProjectWithSchemaReloadRetry(input.orgContext, input.projectId, {
    byo_db_url: input.supabaseUrl,
    byo_db_anon_key: input.supabaseAnonKey,
    database_enabled: true,
    db_provider: "supabase",
    db_config: {
      url: input.supabaseUrl,
      anonKey: input.supabaseAnonKey,
    },
    db_schema: null,
    db_nonce: null,
    db_wired: false,
    ...input.extraProjectPatch,
  });

  const latestGeneration = await input.orgContext.db.findLatestGenerationByProjectId(input.projectId);
  const existingFiles = Array.isArray(latestGeneration?.files)
    ? latestGeneration.files as readonly StudioFile[]
    : [];

  const buildId = await queueSupabaseAutoWireIteration(
    input.orgContext,
    input.project,
    input.projectId,
    input.prompt,
    existingFiles,
    runBuildInBackgroundFn,
  );

  const completedGeneration = await waitForGenerationCompletion(input.orgContext.db, buildId);
  const generationFiles = Array.isArray(completedGeneration?.files)
    ? completedGeneration.files
    : [];
  console.log("[supabaseByo] auto-wire iteration completed", {
    buildId,
    projectId: input.projectId,
    status: completedGeneration?.status ?? null,
    fileCount: generationFiles.length,
  });
  const migrations = readMigrationStatementsFromMetadata(completedGeneration?.metadata);
  const setupSql = migrations.join("\n\n")
    || readSetupSqlFromMetadata(completedGeneration?.metadata)
    || buildSupabaseSetupSqlFromFiles(generationFiles);

  if (migrations.length === 0) {
    console.log("[supabaseByo] no migrations detected after auto-wire", {
      buildId,
      projectId: input.projectId,
      hasSetupSqlFallback: Boolean(setupSql),
    });
    return setupSql
      ? { host, wiring: true, setupSql }
      : { host, wiring: true };
  }

  console.log("[supabaseByo] executing BYO Supabase migrations", {
    buildId,
    projectId: input.projectId,
    projectRef,
    migrationCount: migrations.length,
  });

  if (oauthAccessToken) {
    for (const migrationSql of migrations) {
      const migrationResult = await runSupabaseManagementQueryWithOAuth({
        projectId: input.projectId,
        supabaseUrl: input.supabaseUrl,
        accessToken: oauthAccessToken,
        refreshToken: oauthRefreshToken,
        query: migrationSql,
        fetchFn,
        logPrefix: "[supabaseByo]",
        persistTokens: async (tokens) => {
          await updateProjectWithSchemaReloadRetry(input.orgContext, input.projectId, {
            supabase_oauth_access_token: encryptProjectSecret(tokens.accessToken),
            supabase_oauth_refresh_token: encryptProjectSecret(tokens.refreshToken),
          });
        },
      });
      oauthAccessToken = migrationResult.accessToken;
      oauthRefreshToken = migrationResult.refreshToken;
    }
    return { host, wiring: true, ...(setupSql ? { setupSql } : {}) };
  }

  console.warn("[supabaseByo] missing OAuth access token for BYO migration execution; returning setup SQL only", {
    buildId,
    projectId: input.projectId,
    projectRef,
    hasServiceRoleKey: Boolean(serviceRoleKey),
  });

  return { host, wiring: true, ...(setupSql ? { setupSql } : {}) };
}
