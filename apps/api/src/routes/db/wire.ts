/**
 * POST /api/projects/:id/db/wire
 *
 * Wires the generated app to its live database using Gemini 2.5 Flash.
 * Constrained to only patch data-layer files — never touches theme, layout,
 * nav, or component structure.
 *
 * Flow:
 *  1. Auth + project ownership check
 *  2. Load latest generation files from DB
 *  3. Load live DB schema (tables + columns) from beomz-user-data
 *  4. Call Gemini 2.5 Flash with constrained prompt
 *  5. Parse patched files + migration SQL from response
 *  6. Execute migration SQL on beomz-user-data
 *  7. Update db_wired = true (only on success)
 *  8. Return { files: [...patched], migrationsApplied }
 *
 * Only sets db_wired=true after verified migration success (fixes V1 race F).
 */
import { Hono } from "hono";

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

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

wireDbRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!isUserDataConfigured()) {
    return c.json({ error: "Database service not configured" }, 503);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return c.json({ error: "Gemini API key not configured" }, 503);
  }

  const { id: projectId } = c.req.param() as { id: string };
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
              `Table: ${t.table_name}\n  Columns: ${t.columns.map((c) => `${c.name} (${c.type})`).join(", ")}`,
          )
          .join("\n")
      : "No tables yet. The AI should generate CREATE TABLE migrations.";

  const dbSchema = project.db_schema;
  const isAdmin = isAdminEmail(user.email);

  const systemPrompt = `You are a database wiring specialist. Your ONLY job is to modify the data layer of a React app to use the project's built-in database via beomz-db helpers.

IMPORTANT CONSTRAINTS:
- ONLY modify files that contain data fetching, data mutation, or mock/static data
- NEVER touch theme.ts, layout files, navigation, or UI structure
- NEVER import @supabase/supabase-js or create any Supabase client
- ALWAYS use the pre-existing helpers from "@/lib/beomz-db": dbRead, dbInsert, dbUpdate, dbDelete
- Generated code must be TypeScript React (.tsx) compatible

The app's live database schema is:
${schemaSummary}

If tables don't exist yet, generate CREATE TABLE migrations using this pattern:
CREATE TABLE IF NOT EXISTS "${dbSchema}"."table_name" (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ...columns
);

OUTPUT FORMAT (strict JSON, no markdown):
{
  "files": [
    { "path": "apps/web/src/app/generated/SomePage.tsx", "content": "..." }
  ],
  "migrations": [
    "CREATE TABLE IF NOT EXISTS ...",
    "CREATE INDEX IF NOT EXISTS ..."
  ]
}

Return ONLY the JSON object. No explanation. No markdown.`;

  const userMessage = `Here are the app's current source files:\n\n${filesSummary}\n\nWire this app to use its live database. Replace all mock/static data with real DB calls.`;

  let geminiResponse: string;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return c.json({ error: `Gemini error (${res.status}): ${errBody}` }, 502);
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    geminiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Gemini request failed" },
      502,
    );
  }

  let parsed: { files?: unknown[]; migrations?: unknown[] };
  try {
    parsed = JSON.parse(geminiResponse) as { files?: unknown[]; migrations?: unknown[] };
  } catch {
    return c.json({ error: "Failed to parse Gemini response as JSON" }, 500);
  }

  const patchedFiles = (parsed.files ?? []) as Array<{ path: string; content: string }>;
  const migrationSql = (parsed.migrations ?? []) as string[];

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
  });
});

export default wireDbRoute;
