/**
 * POST /api/projects/:id/db/migrate
 *
 * Executes SQL migration statements against the project's database.
 * Applies the isAllowedMigrationStatement allowlist for managed DBs.
 * For BYO Supabase, executes against the user's project via the REST API.
 *
 * Request body: { sql: string[] }
 * Returns: { applied: number, errors: string[] }
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  isAllowedMigrationStatement,
  isUserDataConfigured,
  runSql,
} from "../../lib/userDataClient.js";

const migrateDbRoute = new Hono();

migrateDbRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const { id: projectId } = c.req.param() as { id: string };
  const orgContext = c.get("orgContext") as OrgContext;
  const { db, org } = orgContext;

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!project.database_enabled) {
    return c.json({ error: "Database not enabled for this project" }, 400);
  }

  const body = (await c.req.json()) as { sql?: unknown };
  const sqlStatements = Array.isArray(body.sql) ? (body.sql as unknown[]) : [];
  const statements = sqlStatements
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());

  if (statements.length === 0) {
    return c.json({ error: "sql[] is required and must not be empty" }, 400);
  }

  const errors: string[] = [];
  let applied = 0;

  if (project.db_provider === "beomz") {
    if (!isUserDataConfigured()) {
      return c.json({ error: "Database service not configured" }, 503);
    }
    if (!project.db_schema) {
      return c.json({ error: "Schema not provisioned" }, 400);
    }

    for (const stmt of statements) {
      if (!isAllowedMigrationStatement(stmt, project.db_schema)) {
        errors.push(`Rejected: ${stmt.slice(0, 100)}`);
        continue;
      }
      try {
        await runSql(stmt.endsWith(";") ? stmt : `${stmt};`);
        applied++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Migration failed");
      }
    }

    // Notify PostgREST to reload
    try {
      await runSql("NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';");
    } catch {
      // non-fatal
    }
  } else if (project.db_provider === "supabase") {
    const cfg = (project.db_config ?? {}) as Record<string, unknown>;
    const supabaseUrl = typeof cfg.url === "string" ? cfg.url : null;
    const anonKey = typeof cfg.anonKey === "string" ? cfg.anonKey : null;

    if (!supabaseUrl || !anonKey) {
      return c.json({ error: "BYO Supabase credentials missing" }, 400);
    }

    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const mgmtKey = process.env.SUPABASE_MANAGEMENT_API_KEY;

    for (const stmt of statements) {
      const sql = stmt.endsWith(";") ? stmt : `${stmt};`;
      try {
        if (mgmtKey) {
          const res = await fetch(
            `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${mgmtKey}`,
              },
              body: JSON.stringify({ query: sql }),
            },
          );
          if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { message?: string };
            errors.push(errData.message ?? `Management API returned ${res.status}`);
            continue;
          }
        } else {
          // Fallback: try via REST (limited to SELECT-like, may fail for DDL)
          const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ query: sql }),
          });
          if (!res.ok) {
            errors.push(`Could not execute migration (status ${res.status}). Provide SUPABASE_MANAGEMENT_API_KEY for DDL support.`);
            continue;
          }
        }
        applied++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Migration failed");
      }
    }
  }

  return c.json({ applied, errors: errors.length > 0 ? errors : undefined });
});

export default migrateDbRoute;
