/**
 * POST /api/projects/:id/db/wire
 *
 * Wires the generated app to its live database using claude-sonnet-4-6.
 * Constrained to only patch data-layer files — never touches theme, layout,
 * nav, or component structure.
 *
 * Flow:
 *  1. Auth + project ownership check
 *  2. Load latest generation files from DB
 *  3. Load live DB schema (tables + columns) from beomz-user-data
 *  4. Call claude-sonnet-4-6 via Anthropic SDK (tool_use for structured output)
 *  5. Parse patched files + migration SQL from tool response
 *  6. Execute migration SQL on beomz-user-data
 *  7. Update db_wired = true (only on success)
 *  8. Return { files: [...patched], migrationsApplied, dbCredentials }
 *
 * Only sets db_wired=true after verified migration success (fixes V1 race F).
 */
import { Hono } from "hono";

import Anthropic from "@anthropic-ai/sdk";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { isAdminEmail } from "../../lib/credits.js";
import type { OrgContext } from "../../types.js";
import {
  getSchemaTableList,
  isAllowedMigrationStatement,
  isUserDataConfigured,
  runSql,
} from "../../lib/userDataClient.js";

const wireDbRoute = new Hono();

const WIRE_MODEL = "claude-sonnet-4-6";

const WIRE_DB_TOOL: Anthropic.Messages.Tool = {
  name: "wire_database",
  description:
    "Return all patched app files and any required SQL migration statements to wire the React app to its live database.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description:
          "The patched source files that replace mock/static data with real Supabase queries using import.meta.env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_DB_SCHEMA.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "Full file path as it appeared in the input, e.g. apps/web/src/app/generated/workspace-task/SomePage.tsx" },
            content: { type: "string", description: "Complete updated file content" },
          },
          required: ["path", "content"],
        },
      },
      migrations: {
        type: "array",
        description:
          "SQL statements to create or alter tables as needed. Each statement must be a single SQL DDL string (no semicolons in the middle). Empty array if no migrations are needed.",
        items: { type: "string" },
      },
    },
    required: ["files", "migrations"],
  },
};

wireDbRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!isUserDataConfigured()) {
    return c.json({ error: "Database service not configured" }, 503);
  }

  const projectId = c.req.param("id") as string;
  const orgContext = c.get("orgContext") as OrgContext;
  const { db, org, user } = orgContext;

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!project.database_enabled || project.db_provider !== "beomz") {
    return c.json({ error: "Built-in database not enabled for this project" }, 400);
  }
  if (!project.db_schema) {
    return c.json({ error: "Schema not provisioned" }, 400);
  }

  // Load latest generation files
  const latestGen = await db.findLatestGenerationByProjectId(projectId);
  if (!latestGen || !Array.isArray(latestGen.files) || latestGen.files.length === 0) {
    return c.json({ error: "No generated files found. Build the app first." }, 400);
  }

  const files = latestGen.files as Array<{ path: string; content: string; kind: string }>;

  // Load live DB schema
  const tables = await getSchemaTableList(project.db_schema);

  const filesSummary = files
    .filter((f) => ["route", "component", "data"].includes(f.kind ?? ""))
    .map((f) => `--- FILE: ${f.path}\n${f.content}`)
    .join("\n\n");

  const schemaSummary =
    tables.length > 0
      ? tables
          .map(
            (t) =>
              `Table: ${t.table_name}\n  Columns: ${t.columns.map((col) => `${col.name} (${col.type})`).join(", ")}`,
          )
          .join("\n")
      : "No tables yet. The AI should generate CREATE TABLE migrations.";

  const dbSchema = project.db_schema;
  const isAdmin = isAdminEmail(user.email);

  const systemPrompt = `You are a database wiring specialist. Your ONLY job is to modify the data layer of a React app to connect it to its live Supabase database.

IMPORTANT CONSTRAINTS:
- ONLY modify files that contain data fetching, data mutation, or mock/static data
- NEVER touch theme.ts, layout files, navigation, or UI structure
- Generated code must be TypeScript React (.tsx) compatible

SUPABASE CLIENT — always initialize like this at the top of every data file:
\`\`\`ts
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
\`\`\`

SCHEMA SCOPING — every query MUST scope to the project schema:
\`\`\`ts
// READ
const { data, error } = await supabase
  .schema(import.meta.env.VITE_DB_SCHEMA)
  .from('table_name')
  .select()

// INSERT
const { data, error } = await supabase
  .schema(import.meta.env.VITE_DB_SCHEMA)
  .from('table_name')
  .insert({ ... })
  .select()
  .single()

// UPDATE
const { error } = await supabase
  .schema(import.meta.env.VITE_DB_SCHEMA)
  .from('table_name')
  .update({ ... })
  .eq('id', id)

// DELETE
const { error } = await supabase
  .schema(import.meta.env.VITE_DB_SCHEMA)
  .from('table_name')
  .delete()
  .eq('id', id)
\`\`\`

DATA PERSISTENCE RULES:
- Every CREATE, READ, UPDATE, DELETE must go through Supabase — never use useState as the source of truth for persisted data
- useState is ONLY for UI loading/error states (isLoading, error message) and optimistic local state
- Always handle errors: if (error) { console.error(error); return; }
- Fetch data on mount with useEffect + a load function
- After mutations, re-fetch or update local state to reflect the change

DO NOT:
- Hardcode the Supabase URL, anon key, or schema name anywhere
- Use \`process.env\` — use \`import.meta.env\` (this is a Vite app)
- Create a shared supabase.ts singleton file — initialize inline in each data file

The app's live database schema is:
${schemaSummary}

If tables don't exist yet, generate CREATE TABLE migrations using this pattern:
CREATE TABLE IF NOT EXISTS "${dbSchema}"."table_name" (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ...columns
);

Call the wire_database tool with the patched files and required SQL migrations.`;

  const userMessage = `Here are the app's current source files:\n\n${filesSummary}\n\nWire this app to use its live database. Replace all mock/static data with real DB calls.`;

  let patchedFiles: Array<{ path: string; content: string }>;
  let migrationSql: string[];

  try {
    const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model: WIRE_MODEL,
      max_tokens: 32000,
      system: systemPrompt,
      tools: [WIRE_DB_TOOL],
      tool_choice: { type: "tool", name: "wire_database" },
      messages: [{ role: "user", content: userMessage }],
    });
    const message = await stream.finalMessage();
    console.log("[wire] Anthropic response:", {
      model: WIRE_MODEL,
      stop_reason: message.stop_reason,
      content_blocks: message.content.length,
      usage: message.usage,
    });

    const toolBlock = message.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolBlock) {
      return c.json({ error: "AI did not return structured wiring output" }, 500);
    }

    const raw = toolBlock.input as { files?: unknown; migrations?: unknown };
    patchedFiles = (Array.isArray(raw.files) ? raw.files : []) as Array<{ path: string; content: string }>;
    migrationSql = (Array.isArray(raw.migrations) ? raw.migrations : []) as string[];
  } catch (err) {
    console.error("[wire] Anthropic error:", err instanceof Error ? err.message : err);
    return c.json(
      { error: err instanceof Error ? err.message : "AI wiring request failed" },
      502,
    );
  }

  // Execute migrations (managed path — apply SQL allowlist)
  const migrationErrors: string[] = [];
  let migrationsApplied = 0;

  for (const stmt of migrationSql) {
    const s = stmt.trim();
    if (!s) continue;
    if (!isAdmin && !isAllowedMigrationStatement(s, dbSchema)) {
      migrationErrors.push(`Rejected: ${s.slice(0, 100)}`);
      continue;
    }
    try {
      await runSql(s.endsWith(";") ? s : `${s};`);
      migrationsApplied++;
    } catch (err) {
      migrationErrors.push(err instanceof Error ? err.message : "Migration failed");
    }
  }

  // Only mark db_wired=true when at least one migration succeeded (or no migrations needed)
  // Never set it if migrations failed entirely
  const wired = migrationErrors.length === 0 || migrationsApplied > 0;
  if (wired) {
    await db.updateProject(projectId, { db_wired: true });
  }

  // Notify PostgREST to reload schema cache
  try {
    await runSql("NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';");
  } catch {
    // non-fatal
  }

  return c.json({
    files: patchedFiles,
    migrationsApplied,
    migrationErrors: migrationErrors.length > 0 ? migrationErrors : undefined,
    wired,
    dbCredentials: {
      supabaseUrl: process.env.USER_DATA_SUPABASE_URL,
      supabaseAnonKey: process.env.USER_DATA_SUPABASE_ANON_KEY,
      schemaName: project.db_schema,
    },
  });
});

export default wireDbRoute;
