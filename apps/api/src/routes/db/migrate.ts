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
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  isAllowedMigrationStatement,
  isUserDataConfigured,
  runSql,
} from "../../lib/userDataClient.js";

// Check if a statement inserts data
function isInsertStatement(stmt: string): boolean {
  return /^INSERT\s+INTO\s+/i.test(stmt.trim());
}

interface MigrateDbRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  isAllowedMigrationStatement?: typeof isAllowedMigrationStatement;
  isUserDataConfigured?: typeof isUserDataConfigured;
  runSql?: typeof runSql;
  fetch?: typeof fetch;
}

export function createMigrateDbRoute(deps: MigrateDbRouteDeps = {}) {
  const migrateDbRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const isAllowedMigrationStatementFn =
    deps.isAllowedMigrationStatement ?? isAllowedMigrationStatement;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const runSqlFn = deps.runSql ?? runSql;
  const fetchFn = deps.fetch ?? fetch;

  migrateDbRoute.post("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id") as string;
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
      if (!isUserDataConfiguredFn()) {
        return c.json({ error: "Database service not configured" }, 503);
      }
      if (!project.db_schema) {
        return c.json({ error: "Schema not provisioned" }, 400);
      }

      // ── BEO-329: Limit enforcement ─────────────────────────────────────────
      const hasInserts = statements.some(isInsertStatement);

      if (hasInserts) {
        const limitsRow = await db.getProjectDbLimits(projectId);

        if (limitsRow) {
          const [rowCountRows, storageRows] = await Promise.all([
            runSqlFn(`
              SELECT COALESCE(SUM(n_live_tup), 0) AS rows_used
              FROM pg_stat_user_tables
              WHERE schemaname = '${project.db_schema}';
            `),
            runSqlFn(`
              SELECT COALESCE(
                SUM(pg_total_relation_size(quote_ident('${project.db_schema}') || '.' || quote_ident(tablename))),
                0
              ) / (1024 * 1024.0) AS storage_mb
              FROM pg_tables
              WHERE schemaname = '${project.db_schema}';
            `),
          ]);

          void parseInt(
            String((rowCountRows[0] as Record<string, unknown>)?.rows_used ?? "0"),
            10,
          );
          const storageMbUsed = parseFloat(
            String((storageRows[0] as Record<string, unknown>)?.storage_mb ?? "0"),
          );

          const totalStorageMb = limitsRow.plan_storage_mb + limitsRow.extra_storage_mb;

          if (storageMbUsed >= totalStorageMb) {
            return c.json(
              {
                error: "storage_limit_reached",
                message: `Storage limit of ${totalStorageMb} MB reached. Upgrade your plan or purchase a storage add-on.`,
                storage_mb_used: Math.round(storageMbUsed * 100) / 100,
                total_storage_mb: totalStorageMb,
              },
              402,
            );
          }
        }
      }
      // ── End limit enforcement ──────────────────────────────────────────────

      for (const stmt of statements) {
        if (!isAllowedMigrationStatementFn(stmt, project.db_schema)) {
          errors.push(`Rejected: ${stmt.slice(0, 100)}`);
          continue;
        }
        try {
          await runSqlFn(stmt.endsWith(";") ? stmt : `${stmt};`);
          applied++;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Migration failed");
        }
      }

      // Notify PostgREST to reload
      try {
        await runSqlFn("NOTIFY pgrst, 'reload config'; NOTIFY pgrst, 'reload schema';");
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
            const res = await fetchFn(
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
            const res = await fetchFn(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/exec_sql`, {
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

  return migrateDbRoute;
}

const migrateDbRoute = createMigrateDbRoute();

export default migrateDbRoute;
