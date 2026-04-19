/**
 * GET /api/projects/:id/db/usage
 *
 * Returns live usage metrics from beomz-user-data for the project schema,
 * plus effective limits from project_db_limits.
 *
 * Response:
 * {
 *   storage_mb_used: number,
 *   rows_used: number,
 *   tables_used: number,
 *   limits: { total_storage_mb: number, total_rows: number, tables_limit: number }
 * }
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { isUserDataConfigured, runSql } from "../../lib/userDataClient.js";
import { getNeonUsage } from "../../lib/neonDb.js";
import { getNeonDbUrl, resolveProjectDbProvider } from "../../lib/projectDb.js";

interface UsageDbRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  isUserDataConfigured?: typeof isUserDataConfigured;
  runSql?: typeof runSql;
  getNeonUsage?: typeof getNeonUsage;
}

function buildUsageResponse(
  storageMbUsed: number,
  rowsUsed: number,
  tablesUsed: number,
  totalStorageMb: number,
  totalRows: number,
  tablesLimit: number,
) {
  return {
    // BEO-429: keep the legacy keys used by the shipped web app so API-only
    // deploys immediately fix the Storage card without requiring a web deploy.
    used_mb: storageMbUsed,
    rows_used: rowsUsed,
    tables_used: tablesUsed,
    storage_mb_used: storageMbUsed,
    limits: {
      storage_mb: totalStorageMb,
      total_storage_mb: totalStorageMb,
      total_rows: totalRows,
      tables_limit: tablesLimit,
    },
  };
}

export function createUsageDbRoute(deps: UsageDbRouteDeps = {}) {
  const usageDbRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const runSqlFn = deps.runSql ?? runSql;
  const getNeonUsageFn = deps.getNeonUsage ?? getNeonUsage;

  usageDbRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
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

    const limitsRow = await db.getProjectDbLimits(projectId);
    const provider = resolveProjectDbProvider(project, limitsRow);

    const totalStorageMb = limitsRow
      ? limitsRow.plan_storage_mb + limitsRow.extra_storage_mb
      : 1024;
    const totalRows = limitsRow
      ? limitsRow.plan_rows + limitsRow.extra_rows
      : 100000;
    const tablesLimit = limitsRow ? limitsRow.tables_limit : 20;

    if (provider === "beomz") {
      if (!project.db_schema) {
        return c.json({ error: "Schema not provisioned" }, 400);
      }
      if (!isUserDataConfiguredFn()) {
        return c.json({ error: "Database service not configured" }, 503);
      }

      const schema = project.db_schema;

      const [storageRows, rowCountRows, tableCountRows] = await Promise.all([
        runSqlFn(`
          SELECT COALESCE(
            SUM(pg_total_relation_size(quote_ident($1) || '.' || quote_ident(tablename))),
            0
          ) / (1024 * 1024.0) AS storage_mb
          FROM pg_tables
          WHERE schemaname = $1;
        `.replace("$1", `'${schema}'`)),

        runSqlFn(`
          SELECT COALESCE(SUM(n_live_tup), 0) AS rows_used
          FROM pg_stat_user_tables
          WHERE schemaname = '${schema}';
        `),

        runSqlFn(`
          SELECT COUNT(*) AS tables_used
          FROM information_schema.tables
          WHERE table_schema = '${schema}'
            AND table_type = 'BASE TABLE';
        `),
      ]);

      const storageMbUsed = Math.round(parseFloat(
        String((storageRows[0] as Record<string, unknown>)?.storage_mb ?? "0"),
      ) * 100) / 100;
      const rowsUsed = parseInt(
        String((rowCountRows[0] as Record<string, unknown>)?.rows_used ?? "0"),
        10,
      );
      const tablesUsed = parseInt(
        String((tableCountRows[0] as Record<string, unknown>)?.tables_used ?? "0"),
        10,
      );

      return c.json(
        buildUsageResponse(
          storageMbUsed,
          rowsUsed,
          tablesUsed,
          totalStorageMb,
          totalRows,
          tablesLimit,
        ),
      );
    }

    if (provider === "neon") {
      const dbUrl = getNeonDbUrl(limitsRow);
      if (!dbUrl) {
        return c.json({ error: "Neon connection string missing" }, 400);
      }
      try {
        const usage = await getNeonUsageFn(dbUrl);
        return c.json(
          buildUsageResponse(
            usage.storageMbUsed,
            usage.rowsUsed,
            usage.tablesUsed,
            totalStorageMb,
            totalRows,
            tablesLimit,
          ),
        );
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to fetch usage" },
          500,
        );
      }
    }

    return c.json({ error: "Built-in database not enabled for this project" }, 400);
  });

  return usageDbRoute;
}

const usageDbRoute = createUsageDbRoute();

export default usageDbRoute;
