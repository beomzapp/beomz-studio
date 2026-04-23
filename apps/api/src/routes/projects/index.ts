/**
 * GET /projects
 *
 * Returns all projects for the authenticated user's org, ordered by
 * last_opened_at desc (recently opened first) then updated_at desc.
 * Also returns the generation count per project and plan gate metadata.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { projectIterationOperation } from "@beomz-studio/operations";
import type { StudioFile, TemplateId } from "@beomz-studio/contracts";
import { neon } from "@neondatabase/serverless";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { mapProjectRowToProject } from "../builds/shared.js";
import { PLAN_LIMITS } from "../../lib/credits.js";
import {
  deleteSchemaRegistry,
  isUserDataConfigured,
  runSql,
} from "../../lib/userDataClient.js";
import { deleteNeonProject } from "../../lib/neonClient.js";
import {
  parsePostgresConnectionString,
  parseSupabaseProjectUrl,
} from "../../lib/projectDb.js";
import { runBuildInBackground } from "../builds/generate.js";
import { buildSupabaseSetupSqlFromFiles } from "../../lib/supabaseSetupSql.js";

interface DatabaseDumpColumn {
  name: string;
  sqlType: string;
  isNullable: boolean;
  defaultExpression: string | null;
}

interface DatabaseDumpTable {
  name: string;
  columns: DatabaseDumpColumn[];
  primaryKeyColumns: string[];
  sequenceColumns: string[];
  rows: Array<Record<string, unknown>>;
}

interface ProjectsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  isUserDataConfigured?: typeof isUserDataConfigured;
  runSql?: typeof runSql;
  deleteSchemaRegistry?: typeof deleteSchemaRegistry;
  deleteNeonProject?: typeof deleteNeonProject;
  dumpNeonDatabase?: typeof dumpNeonDatabase;
  restoreSupabaseDatabase?: typeof restoreSupabaseDatabase;
  ensureByoDbAnonKeyColumn?: () => Promise<void>;
  runBuildInBackground?: typeof runBuildInBackground;
}

const SUPABASE_MANAGEMENT_API_BASE = "https://api.supabase.com/v1";
const STUDIO_DB_SCHEMA_RELOAD_DELAY_MS = 750;
const AUTO_WIRE_BUILD_MODEL = "claude-sonnet-4-6";
const AUTO_WIRE_WAIT_TIMEOUT_MS = 60_000;
const AUTO_WIRE_WAIT_POLL_MS = 500;
const AUTO_WIRE_SUPABASE_ITERATION_PROMPT = [
  "Rewire the entire app to use Supabase instead of hardcoded data.",
  "Use this exact import line, character for character:",
  'import { createClient } from "@supabase/supabase-js"',
  'The package name is "@supabase/supabase-js" — do NOT use "./supabase-js", "supabase-js", or any relative path.',
  "NEVER use raw fetch() to call Supabase REST endpoints directly.",
  "NEVER construct URLs like `${supabaseUrl}/rest/v1/tasks?select=*`.",
  "ALWAYS use the supabase client exclusively:",
  "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)",
  "const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })",
  "Use import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY.",
  "Replace all hardcoded arrays and sample data with real Supabase queries.",
  "Use useEffect + useState for data fetching with loading and error states.",
].join("\n");
const UPGRADE_TO_BYO_ITERATION_PROMPT = [
  "Rewire the entire app to use Supabase instead of Neon.",
  "Use this exact import line, character for character:",
  'import { createClient } from "@supabase/supabase-js"',
  'The package name is "@supabase/supabase-js" — do NOT use "./supabase-js", "supabase-js", or any relative path.',
  "NEVER use raw fetch() to call Supabase REST endpoints directly.",
  "NEVER construct URLs like `${supabaseUrl}/rest/v1/tasks?select=*`.",
  "ALWAYS use the supabase client exclusively:",
  "const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)",
  "const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })",
  "Use import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY.",
  "Replace all Neon/postgres queries with Supabase queries.",
  "Use useEffect + useState with loading and error states.",
].join("\n");

function assertSafeSqlIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
}

function quoteIdentifier(identifier: string): string {
  return `"${assertSafeSqlIdentifier(identifier)}"`;
}

function quoteQualifiedPublicTable(tableName: string): string {
  return `${quoteIdentifier("public")}.${quoteIdentifier(tableName)}`;
}

function escapeSqlStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function buildCreateTableStatement(table: DatabaseDumpTable): string {
  const primaryKeyColumns = table.primaryKeyColumns.map((columnName) => quoteIdentifier(columnName));
  const columnDefinitions = table.columns.map((column) => {
    const usesSequenceDefault = column.defaultExpression?.includes("nextval(") ?? false;
    const defaultClause = usesSequenceDefault
      ? " GENERATED BY DEFAULT AS IDENTITY"
      : column.defaultExpression
        ? ` DEFAULT ${column.defaultExpression}`
        : "";
    const notNullClause = column.isNullable ? "" : " NOT NULL";
    return `${quoteIdentifier(column.name)} ${column.sqlType}${defaultClause}${notNullClause}`;
  });

  if (primaryKeyColumns.length > 0) {
    columnDefinitions.push(`PRIMARY KEY (${primaryKeyColumns.join(", ")})`);
  }

  return `CREATE TABLE ${quoteQualifiedPublicTable(table.name)} (${columnDefinitions.join(", ")});`;
}

function buildInsertRowsStatement(table: DatabaseDumpTable): string | null {
  if (table.rows.length === 0) {
    return null;
  }

  const jsonPayload = escapeSqlStringLiteral(JSON.stringify(table.rows));
  return [
    `INSERT INTO ${quoteQualifiedPublicTable(table.name)}`,
    `SELECT * FROM jsonb_populate_recordset(NULL::${quoteQualifiedPublicTable(table.name)}, '${jsonPayload}'::jsonb);`,
  ].join("\n");
}

function buildSequenceResetStatements(table: DatabaseDumpTable): string[] {
  return table.sequenceColumns.map((columnName) => [
    "SELECT setval(",
    `  pg_get_serial_sequence('${quoteQualifiedPublicTable(table.name)}', '${escapeSqlStringLiteral(columnName)}'),`,
    `  COALESCE(MAX(${quoteIdentifier(columnName)}), 1),`,
    `  MAX(${quoteIdentifier(columnName)}) IS NOT NULL`,
    `) FROM ${quoteQualifiedPublicTable(table.name)};`,
  ].join("\n"));
}

async function runSupabaseExecSql(
  supabaseUrl: string,
  supabaseAnonKey: string,
  sql: string,
): Promise<void> {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(`Supabase exec_sql failed (${response.status})${body ? `: ${body}` : ""}`);
}

async function cleanupSupabaseTables(
  supabaseUrl: string,
  supabaseAnonKey: string,
  createdTables: readonly string[],
): Promise<void> {
  for (const tableName of [...createdTables].reverse()) {
    await runSupabaseExecSql(
      supabaseUrl,
      supabaseAnonKey,
      `DROP TABLE IF EXISTS ${quoteQualifiedPublicTable(tableName)} CASCADE;`,
    ).catch(() => undefined);
  }
}

async function dumpNeonDatabase(connectionString: string): Promise<DatabaseDumpTable[]> {
  const sql = neon(connectionString) as ReturnType<typeof neon> & {
    query: <T extends Record<string, unknown>>(query: string, params?: unknown[]) => Promise<T[]>;
  };

  const [tableRows, columnRows, primaryKeyRows] = await Promise.all([
    sql.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `),
    sql.query<{
      table_name: string;
      column_name: string;
      formatted_type: string;
      is_nullable: boolean;
      column_default: string | null;
      is_identity: string | null;
    }>(`
      SELECT
        cols.table_name,
        cols.column_name,
        pg_catalog.format_type(attrs.atttypid, attrs.atttypmod) AS formatted_type,
        cols.is_nullable = 'YES' AS is_nullable,
        cols.column_default,
        cols.is_identity
      FROM information_schema.columns AS cols
      JOIN pg_catalog.pg_class AS cls
        ON cls.relname = cols.table_name
      JOIN pg_catalog.pg_namespace AS ns
        ON ns.oid = cls.relnamespace
       AND ns.nspname = cols.table_schema
      JOIN pg_catalog.pg_attribute AS attrs
        ON attrs.attrelid = cls.oid
       AND attrs.attname = cols.column_name
      WHERE cols.table_schema = 'public'
        AND cls.relkind = 'r'
      ORDER BY cols.table_name, cols.ordinal_position;
    `),
    sql.query<{
      table_name: string;
      column_name: string;
    }>(`
      SELECT
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position;
    `),
  ]);

  const columnsByTable = new Map<string, DatabaseDumpColumn[]>();
  const primaryKeysByTable = new Map<string, string[]>();
  const sequenceColumnsByTable = new Map<string, string[]>();

  for (const column of columnRows) {
    const columns = columnsByTable.get(column.table_name) ?? [];
    columns.push({
      name: column.column_name,
      sqlType: column.formatted_type,
      isNullable: Boolean(column.is_nullable),
      defaultExpression: column.column_default,
    });
    columnsByTable.set(column.table_name, columns);

    if (column.is_identity === "YES" || column.column_default?.includes("nextval(")) {
      const sequenceColumns = sequenceColumnsByTable.get(column.table_name) ?? [];
      sequenceColumns.push(column.column_name);
      sequenceColumnsByTable.set(column.table_name, sequenceColumns);
    }
  }

  for (const primaryKey of primaryKeyRows) {
    const primaryKeys = primaryKeysByTable.get(primaryKey.table_name) ?? [];
    primaryKeys.push(primaryKey.column_name);
    primaryKeysByTable.set(primaryKey.table_name, primaryKeys);
  }

  return Promise.all(
    tableRows.map(async ({ table_name }) => ({
      name: table_name,
      columns: columnsByTable.get(table_name) ?? [],
      primaryKeyColumns: primaryKeysByTable.get(table_name) ?? [],
      sequenceColumns: sequenceColumnsByTable.get(table_name) ?? [],
      rows: await sql.query<Record<string, unknown>>(
        `SELECT * FROM ${quoteQualifiedPublicTable(table_name)};`,
      ),
    })),
  );
}

async function restoreSupabaseDatabase(input: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  tables: readonly DatabaseDumpTable[];
}): Promise<void> {
  const createdTables: string[] = [];

  try {
    for (const table of input.tables) {
      await runSupabaseExecSql(
        input.supabaseUrl,
        input.supabaseAnonKey,
        buildCreateTableStatement(table),
      );
      createdTables.push(table.name);
    }

    for (const table of input.tables) {
      const insertStatement = buildInsertRowsStatement(table);
      if (insertStatement) {
        await runSupabaseExecSql(input.supabaseUrl, input.supabaseAnonKey, insertStatement);
      }

      for (const resetStatement of buildSequenceResetStatements(table)) {
        await runSupabaseExecSql(input.supabaseUrl, input.supabaseAnonKey, resetStatement);
      }
    }
  } catch (error) {
    await cleanupSupabaseTables(input.supabaseUrl, input.supabaseAnonKey, createdTables);
    throw error;
  }
}

function getStudioProjectRef(): string {
  return new URL(apiConfig.STUDIO_SUPABASE_URL).hostname.split(".")[0] ?? "";
}

async function ensureByoDbAnonKeyColumn(): Promise<void> {
  const managementKey = apiConfig.SUPABASE_MANAGEMENT_API_KEY?.trim();
  if (!managementKey) {
    return;
  }

  const response = await fetch(
    `${SUPABASE_MANAGEMENT_API_BASE}/projects/${getStudioProjectRef()}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managementKey}`,
      },
      body: JSON.stringify({
        query: "ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS byo_db_anon_key TEXT;",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to migrate projects.byo_db_anon_key (${response.status}): ${body}`);
  }
}

async function updateProjectWithSchemaReloadRetry(
  orgContext: OrgContext,
  projectId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    await orgContext.db.updateProject(projectId, patch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/byo_db_anon_key|schema cache/i.test(message)) {
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

async function queueSupabaseAutoWireIteration(
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

function readSetupSqlFromMetadata(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return "";
  }

  const setupSql = (metadata as Record<string, unknown>).setupSql;
  return typeof setupSql === "string" ? setupSql : "";
}

async function waitForGenerationCompletion(
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

export function createProjectsRoute(deps: ProjectsRouteDeps = {}) {
  const projectsRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const runSqlFn = deps.runSql ?? runSql;
  const deleteSchemaRegistryFn = deps.deleteSchemaRegistry ?? deleteSchemaRegistry;
  const deleteNeonProjectFn = deps.deleteNeonProject ?? deleteNeonProject;
  const dumpNeonDatabaseFn = deps.dumpNeonDatabase ?? dumpNeonDatabase;
  const restoreSupabaseDatabaseFn = deps.restoreSupabaseDatabase ?? restoreSupabaseDatabase;
  const ensureByoDbAnonKeyColumnFn = deps.ensureByoDbAnonKeyColumn ?? ensureByoDbAnonKeyColumn;
  const runBuildInBackgroundFn = deps.runBuildInBackground ?? runBuildInBackground;

  projectsRoute.get("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;
      const projectId = c.req.param("id");

      const project = await orgContext.db.findProjectById(projectId);
      if (!project || project.org_id !== orgContext.org.id) {
        return c.json({ error: "Project not found" }, 404);
      }

      return c.json({
        ...mapProjectRowToProject(project),
        // Extra fields not on the core Project type
        database_enabled: Boolean(project.database_enabled),
        db_provider: project.db_provider ?? null,
        db_wired: Boolean(project.db_wired),
        thumbnail_url: project.thumbnail_url ?? null,
        published: Boolean(project.published),
        published_slug: project.published_slug ?? null,
        beomz_app_url: project.beomz_app_url ?? null,
      });
    } catch (err) {
      console.error("[GET /projects/:id] error:", err);
      return c.json({ error: "Failed to load project." }, 500);
    }
  });

  projectsRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    try {
      const orgContext = c.get("orgContext") as OrgContext;

      const rows = await orgContext.db.findProjectsByOrgId(orgContext.org.id);

      const genCounts = await orgContext.db.countGenerationsByProjectIds(
        rows.map((r) => r.id),
      );

      const projects = rows.map((row) => ({
        ...mapProjectRowToProject(row),
        generationCount: genCounts[row.id] ?? 0,
        // BEO-130: DB status for the frontend (no credentials, no nonce)
        database_enabled: Boolean(row.database_enabled),
        db_provider: row.db_provider ?? null,
        db_wired: Boolean(row.db_wired),
        // BEO-300: thumbnail for project cards
        thumbnail_url: row.thumbnail_url ?? null,
        // BEO-262: Publish
        published: Boolean(row.published),
        published_slug: row.published_slug ?? null,
        beomz_app_url: row.beomz_app_url ?? null,
      }));
      const plan = orgContext.org.plan ?? "free";
      const planLimit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
      // Free plan is capped at 3 projects; paid plans are unlimited (-1 = unlimited)
      const maxProjects = plan === "free" ? 3 : -1;

      return c.json({
        projects,
        plan,
        maxProjects,
        canCreateMore: maxProjects === -1 || projects.length < maxProjects,
        planCredits: planLimit.credits,
      });
    } catch (err) {
      console.error("[GET /projects] error:", err);
      return c.json({ error: "Failed to load projects." }, 500);
    }
  });

  projectsRoute.delete("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    let neonProjectId: string | null = null;
    try {
      const dbWithLimits = orgContext.db as OrgContext["db"] & {
        getProjectDbLimits?: (projectId: string) => Promise<{ neon_project_id?: string | null } | null>;
      };
      const limits = await dbWithLimits.getProjectDbLimits?.(projectId);
      neonProjectId = typeof limits?.neon_project_id === "string" ? limits.neon_project_id : null;
    } catch (err) {
      console.error("[projects/delete] failed reading project_db_limits (non-fatal):", err);
    }

    await orgContext.db.deleteProject(projectId);

    try {
      const dbWithCleanup = orgContext.db as OrgContext["db"] & {
        deleteProjectDbLimits?: (projectId: string) => Promise<void>;
      };
      await dbWithCleanup.deleteProjectDbLimits?.(projectId);

      if (project.db_provider === "beomz" && isUserDataConfiguredFn()) {
        const schemasToDrop = new Set<string>([`project_${projectId}`]);
        if (project.db_schema) {
          schemasToDrop.add(project.db_schema);
        }

        for (const schemaName of schemasToDrop) {
          await runSqlFn(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
        }

        if (project.db_schema) {
          await deleteSchemaRegistryFn(project.db_schema);
        }
      }

      if (neonProjectId) {
        await deleteNeonProjectFn(neonProjectId).catch((err) => {
          console.error("[delete] Neon cleanup failed:", err);
          // Non-fatal
        });
      }
    } catch (err) {
      console.error("[projects/delete] cleanup error:", err);
      // Deletion should still succeed even if DB cleanup fails.
    }

    return c.json({ ok: true });
  });

  projectsRoute.patch("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json<{ name?: string }>();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "Name is required" }, 400);
    }

    await orgContext.db.updateProject(projectId, { name: body.name.trim() });

    return c.json({ ok: true });
  });

  projectsRoute.post("/:id/byo-db", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json().catch(() => null) as {
      supabaseUrl?: unknown;
      supabaseAnonKey?: unknown;
    } | null;
    const rawSupabaseUrl = typeof body?.supabaseUrl === "string"
      ? body.supabaseUrl
      : "";
    if (!rawSupabaseUrl.trim()) {
      return c.json({ error: "supabaseUrl is required" }, 400);
    }

    const supabaseAnonKey = typeof body?.supabaseAnonKey === "string"
      ? body.supabaseAnonKey.trim()
      : "";
    if (!supabaseAnonKey) {
      return c.json({ error: "supabaseAnonKey is required" }, 400);
    }

    let parsed: { supabaseUrl: string; host: string };
    try {
      parsed = parseSupabaseProjectUrl(rawSupabaseUrl);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Invalid Supabase URL" },
        400,
      );
    }

    try {
      await ensureByoDbAnonKeyColumnFn();
    } catch (error) {
      console.error("[projects/byo-db] failed ensuring byo_db_anon_key column:", error);
      return c.json({ error: "Failed to prepare BYO DB storage" }, 500);
    }

    const patch = {
      byo_db_url: parsed.supabaseUrl,
      byo_db_anon_key: supabaseAnonKey,
    };

    try {
      await updateProjectWithSchemaReloadRetry(orgContext, projectId, patch);
    } catch (error) {
      throw error;
    }

    const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectId);
    const existingFiles = Array.isArray(latestGeneration?.files)
      ? latestGeneration.files as readonly StudioFile[]
      : [];

    const buildId = await queueSupabaseAutoWireIteration(
      orgContext,
      project,
      projectId,
      AUTO_WIRE_SUPABASE_ITERATION_PROMPT,
      existingFiles,
      runBuildInBackgroundFn,
    );

    const completedGeneration = await waitForGenerationCompletion(orgContext.db, buildId);
    const generationFiles = Array.isArray(completedGeneration?.files)
      ? completedGeneration.files
      : [];
    const setupSql = readSetupSqlFromMetadata(completedGeneration?.metadata)
      || buildSupabaseSetupSqlFromFiles(generationFiles);

    return c.json({ success: true, host: parsed.host, wiring: true, setupSql });
  });

  projectsRoute.post("/:id/upgrade-to-byo", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json().catch(() => null) as {
      byo_db_url?: unknown;
      byo_db_anon_key?: unknown;
    } | null;
    const rawByoDbUrl = typeof body?.byo_db_url === "string"
      ? body.byo_db_url
      : "";
    if (!rawByoDbUrl.trim()) {
      return c.json({ error: "byo_db_url is required" }, 400);
    }

    const byoDbAnonKey = typeof body?.byo_db_anon_key === "string"
      ? body.byo_db_anon_key.trim()
      : "";
    if (!byoDbAnonKey) {
      return c.json({ error: "byo_db_anon_key is required" }, 400);
    }

    let parsedByoDb: { supabaseUrl: string; host: string };
    try {
      parsedByoDb = parseSupabaseProjectUrl(rawByoDbUrl);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Invalid Supabase URL" },
        400,
      );
    }

    const dbWithLimits = orgContext.db as OrgContext["db"] & {
      getProjectDbLimits?: (id: string) => Promise<{
        neon_project_id?: string | null;
        db_url?: string | null;
      } | null>;
      updateProjectDbConnection?: (
        id: string,
        patch: {
          neon_project_id?: string | null;
          neon_branch_id?: string | null;
          db_url?: string | null;
          neon_auth_base_url?: string | null;
          neon_auth_pub_key?: string | null;
          neon_auth_secret_key?: string | null;
        },
      ) => Promise<void>;
    };

    let neonProjectId = "";
    let neonConnectionString = "";
    try {
      const limits = await dbWithLimits.getProjectDbLimits?.(projectId);
      neonProjectId = typeof limits?.neon_project_id === "string"
        ? limits.neon_project_id.trim()
        : "";
      neonConnectionString = typeof limits?.db_url === "string"
        ? parsePostgresConnectionString(limits.db_url).connectionString
        : "";
    } catch (error) {
      console.error("[projects/upgrade-to-byo] failed reading Neon connection:", error);
      return c.json({ error: "Failed to load Neon database connection" }, 500);
    }

    if (!neonProjectId || !neonConnectionString) {
      return c.json({ error: "Failed to load Neon database connection" }, 500);
    }

    let dumpedTables: DatabaseDumpTable[] = [];
    try {
      dumpedTables = await dumpNeonDatabaseFn(neonConnectionString);
    } catch (error) {
      console.error("[projects/upgrade-to-byo] failed dumping Neon database:", error);
      return c.json({ error: "Failed to dump Neon database" }, 500);
    }

    try {
      await restoreSupabaseDatabaseFn({
        supabaseUrl: parsedByoDb.supabaseUrl,
        supabaseAnonKey: byoDbAnonKey,
        tables: dumpedTables,
      });
    } catch (error) {
      console.error("[projects/upgrade-to-byo] failed restoring Supabase database:", error);
      return c.json({ error: "Failed to restore Supabase database" }, 500);
    }

    try {
      await deleteNeonProjectFn(neonProjectId);
    } catch (error) {
      console.error(
        "[projects/upgrade-to-byo] orphaned Neon project after successful migration:",
        { projectId, neonProjectId, error },
      );
    }

    try {
      await ensureByoDbAnonKeyColumnFn();
      await updateProjectWithSchemaReloadRetry(orgContext, projectId, {
        byo_db_url: parsedByoDb.supabaseUrl,
        byo_db_anon_key: byoDbAnonKey,
        database_enabled: true,
        db_provider: "supabase",
        db_config: {
          url: parsedByoDb.supabaseUrl,
          anonKey: byoDbAnonKey,
        },
        db_schema: null,
        db_nonce: null,
        db_wired: false,
      });
      if (!dbWithLimits.updateProjectDbConnection) {
        throw new Error("updateProjectDbConnection is unavailable");
      }
      await dbWithLimits.updateProjectDbConnection?.(projectId, {
        neon_project_id: null,
        neon_branch_id: null,
        db_url: null,
        neon_auth_base_url: null,
        neon_auth_pub_key: null,
        neon_auth_secret_key: null,
      });
    } catch (error) {
      console.error("[projects/upgrade-to-byo] failed saving Supabase config:", error);
      return c.json({ error: "Failed to save migrated database settings" }, 500);
    }

    try {
      const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectId);
      const existingFiles = Array.isArray(latestGeneration?.files)
        ? latestGeneration.files as readonly StudioFile[]
        : [];

      await queueSupabaseAutoWireIteration(
        orgContext,
        project,
        projectId,
        UPGRADE_TO_BYO_ITERATION_PROMPT,
        existingFiles,
        runBuildInBackgroundFn,
      );
    } catch (error) {
      console.error("[projects/upgrade-to-byo] failed queueing rewire iteration:", error);
      return c.json({ error: "Failed to queue Supabase rewire" }, 500);
    }

    return c.json({ migrating: true });
  });

  projectsRoute.delete("/:id/byo-db", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    await orgContext.db.updateProject(projectId, {
      byo_db_url: null,
      byo_db_anon_key: null,
    });

    return c.json({ ok: true });
  });

  return projectsRoute;
}

const projectsRoute = createProjectsRoute();

export default projectsRoute;
