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
import type { StudioFile } from "@beomz-studio/contracts";

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

  const systemPrompt = `You are a database wiring specialist. Your task: take the React app files below and rewrite every data file so all reads and writes go through Supabase. Follow the EXACT code templates below — do not invent an alternative pattern.

════════════════════════════════════════════
STEP 1 — REMOVE ALL MOCK DATA (mandatory)
════════════════════════════════════════════
- DELETE every hardcoded array: const INITIAL_TODOS = [...], const todos = [...], const ITEMS = [...], etc.
- DELETE every seed object / fixture / sample record
- useState must NEVER hold the initial dataset — arrays must always start empty: useState<Item[]>([])
- Fetching from Supabase on mount replaces the hardcoded array

════════════════════════════════════════════
STEP 2 — COPY THIS EXACT SUPABASE SETUP
════════════════════════════════════════════
Add these three lines at the top of EVERY file that reads or writes data:

import { createClient } from '@supabase/supabase-js'
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
const db = supabase.schema(import.meta.env.VITE_DB_SCHEMA)

Rules:
- NEVER hardcode the URL, key, or schema name
- NEVER use process.env — this is a Vite app, use import.meta.env
- NEVER create a shared supabase.ts file — initialize inline in each file that needs it

════════════════════════════════════════════
STEP 3 — COPY THESE EXACT CRUD PATTERNS
════════════════════════════════════════════
Replace every mock read/write with the matching pattern below.
Adapt 'items'/'Item'/'table_name' to match the actual data entity.

LOADING (on mount):
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    db.from('table_name').select('*').then(({ data, error }) => {
      if (error) { console.error(error); return }
      setItems(data || [])
      setLoading(false)
    })
  }, [])

CREATING:
  const addItem = async (item: Omit<Item, 'id'>) => {
    const { data, error } = await db.from('table_name').insert(item).select().single()
    if (error) { console.error(error); return }
    setItems(prev => [...prev, data])
  }

UPDATING:
  const updateItem = async (id: string, changes: Partial<Item>) => {
    const { error } = await db.from('table_name').update(changes).eq('id', id)
    if (error) { console.error(error); return }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i))
  }

DELETING:
  const deleteItem = async (id: string) => {
    const { error } = await db.from('table_name').delete().eq('id', id)
    if (error) { console.error(error); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

════════════════════════════════════════════
ADDITIONAL RULES
════════════════════════════════════════════
- ONLY modify files that contain data fetching, mutations, or mock/static data
- NEVER touch theme.ts, layout files, navigation, or UI component structure
- useState is ONLY for: loading boolean, error message, and local UI state (modals, form inputs)
- Every async function that calls Supabase must be async/await and check for error
- Generated code must be TypeScript React (.tsx) compatible

════════════════════════════════════════════
LIVE DATABASE SCHEMA
════════════════════════════════════════════
${schemaSummary}

If a required table doesn't exist yet, add a CREATE TABLE migration:
CREATE TABLE IF NOT EXISTS "${dbSchema}"."table_name" (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ...columns
);

Call the wire_database tool with the patched files and required SQL migrations.`;

  const userMessage = `Here are the app's current source files:\n\n${filesSummary}\n\nRewrite the data layer:\n1. REMOVE every hardcoded array (INITIAL_X, const items = [...], seed data)\n2. Add the Supabase client (createClient + db = supabase.schema(...)) at the top of each data file\n3. Replace every hardcoded read with a useEffect + db.from(...).select() call\n4. Replace every mock create/update/delete with the matching db.from(...).insert/update/delete call\n5. Return the changed files and any required CREATE TABLE migrations`;

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

    console.log("[wire] patched files count:", patchedFiles.length);
    console.log("[wire] patched file paths:", patchedFiles.map((f) => f.path));
    console.log("[wire] files containing createClient:", patchedFiles.filter((f) => f.content.includes("createClient")).map((f) => f.path));
    console.log("[wire] files still containing hardcoded arrays:", patchedFiles.filter((f) => /const\s+\w*(?:INITIAL|MOCK|SEED|DATA|ITEMS|TODOS|TASKS)\w*\s*[=:]\s*\[/.test(f.content)).map((f) => f.path));
    if (migrationSql.length > 0) {
      console.log("[wire] migration SQL statements:", migrationSql);
    }
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

    // Persist wired files back to the generation row so the next page load
    // serves the Supabase-powered files instead of the original mock-data build.
    const originalFilesArr = files as Array<Record<string, unknown>>;
    const patchedByPath = new Map(patchedFiles.map((f) => [f.path, f.content]));
    const mergedFiles = originalFilesArr.map((f) =>
      patchedByPath.has(f.path as string)
        ? { ...f, content: patchedByPath.get(f.path as string) }
        : f,
    );
    try {
      await db.updateGeneration(latestGen.id, { files: mergedFiles as unknown as readonly StudioFile[] });
      console.log("[wire] Persisted wired files to generation", latestGen.id, "— patched:", patchedFiles.length, "of", mergedFiles.length, "total");
    } catch (persistErr) {
      // Non-fatal — db_wired is already set; files will update on next wire
      console.error("[wire] Failed to persist wired files (non-fatal):", persistErr instanceof Error ? persistErr.message : persistErr);
    }
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
