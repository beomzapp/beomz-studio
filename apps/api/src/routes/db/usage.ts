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

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { isUserDataConfigured, runSql } from "../../lib/userDataClient.js";

const usageDbRoute = new Hono();

usageDbRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const projectId = c.req.param("id") as string;
  const orgContext = c.get("orgContext") as OrgContext;
  const { db, org } = orgContext;

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!project.database_enabled || project.db_provider !== "beomz" || !project.db_schema) {
    return c.json({ error: "Built-in database not enabled for this project" }, 400);
  }

  if (!isUserDataConfigured()) {
    return c.json({ error: "Database service not configured" }, 503);
  }

  const schema = project.db_schema;

  // Query usage metrics from beomz-user-data via Management API
  const [storageRows, rowCountRows, tableCountRows] = await Promise.all([
    runSql(`
      SELECT COALESCE(
        SUM(pg_total_relation_size(quote_ident($1) || '.' || quote_ident(tablename))),
        0
      ) / (1024 * 1024.0) AS storage_mb
      FROM pg_tables
      WHERE schemaname = $1;
    `.replace("$1", `'${schema}'`)),

    runSql(`
      SELECT COALESCE(SUM(n_live_tup), 0) AS rows_used
      FROM pg_stat_user_tables
      WHERE schemaname = '${schema}';
    `),

    runSql(`
      SELECT COUNT(*) AS tables_used
      FROM information_schema.tables
      WHERE table_schema = '${schema}'
        AND table_type = 'BASE TABLE';
    `),
  ]);

  const storageMbUsed = parseFloat(
    String((storageRows[0] as Record<string, unknown>)?.storage_mb ?? "0")
  );
  const rowsUsed = parseInt(
    String((rowCountRows[0] as Record<string, unknown>)?.rows_used ?? "0"),
    10,
  );
  const tablesUsed = parseInt(
    String((tableCountRows[0] as Record<string, unknown>)?.tables_used ?? "0"),
    10,
  );

  // Get effective limits from project_db_limits
  const limitsRow = await db.getProjectDbLimits(projectId);

  const totalStorageMb = limitsRow
    ? limitsRow.plan_storage_mb + limitsRow.extra_storage_mb
    : 1024;
  const totalRows = limitsRow
    ? limitsRow.plan_rows + limitsRow.extra_rows
    : 100000;
  const tablesLimit = limitsRow ? limitsRow.tables_limit : 20;

  return c.json({
    storage_mb_used: Math.round(storageMbUsed * 100) / 100,
    rows_used: rowsUsed,
    tables_used: tablesUsed,
    limits: {
      total_storage_mb: totalStorageMb,
      total_rows: totalRows,
      tables_limit: tablesLimit,
    },
  });
});

export default usageDbRoute;
