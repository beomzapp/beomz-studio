/**
 * GET /api/projects/:id/db/data?table=<tableName>
 *
 * Returns up to 100 rows from a project's database for the Database panel Data tab.
 */
import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { fetchTableRows } from "../../lib/neonDb.js";
import {
  getProjectPostgresUrl,
  getProjectSupabaseConfig,
  resolveProjectDbProvider,
} from "../../lib/projectDb.js";

function buildSupabaseClient(supabaseUrl: string, supabaseAnonKey: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function fetchSupabaseTableRows(
  supabaseUrl: string,
  supabaseAnonKey: string,
  tableName: string,
): Promise<{ rows: Array<Record<string, unknown>>; columns: string[] }> {
  const client = buildSupabaseClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client
    .from(tableName)
    .select("*")
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data)
    ? data.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : [];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return { rows, columns };
}

interface DataDbRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  fetchTableRows?: typeof fetchTableRows;
  fetchSupabaseTableRows?: typeof fetchSupabaseTableRows;
}

export function createDataDbRoute(deps: DataDbRouteDeps = {}) {
  const dataDbRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const fetchTableRowsFn = deps.fetchTableRows ?? fetchTableRows;
  const fetchSupabaseTableRowsFn = deps.fetchSupabaseTableRows ?? fetchSupabaseTableRows;

  dataDbRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id");
    const tableName = c.req.query("table");
    const orgContext = c.get("orgContext") as OrgContext;
    const { db, org } = orgContext;

    if (!projectId) {
      return c.json({ error: "Project ID is required" }, 400);
    }

    if (!tableName) {
      return c.json({ error: "Table name is required" }, 400);
    }

    if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
      return c.json({ error: "Invalid table name" }, 400);
    }

    const project = await db.findProjectById(projectId);
    if (!project || project.org_id !== org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const supabaseConfig = getProjectSupabaseConfig(project);

    if (supabaseConfig) {
      try {
        const result = await fetchSupabaseTableRowsFn(
          supabaseConfig.supabaseUrl,
          supabaseConfig.supabaseAnonKey,
          tableName,
        );
        return c.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch table rows";
        const status = /not found|invalid table/i.test(message) ? 400 : 500;
        return c.json({ error: message }, status);
      }
    }

    if (!project.database_enabled) {
      return c.json({ error: "Database not enabled for this project" }, 400);
    }

    const limits = await db.getProjectDbLimits(projectId);
    const provider = resolveProjectDbProvider(project, limits);

    if (provider !== "neon" && provider !== "postgres") {
      return c.json({ error: "Database not enabled for this project" }, 400);
    }

    const dbUrl = getProjectPostgresUrl(project, limits);
    if (!dbUrl) {
      return c.json({ error: "Postgres connection string missing" }, 400);
    }

    try {
      const result = await fetchTableRowsFn(dbUrl, tableName);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch table rows";
      const status = message === "Table not found" || message === "Invalid table name" ? 400 : 500;
      return c.json({ error: message }, status);
    }
  });

  return dataDbRoute;
}

const dataDbRoute = createDataDbRoute();

export default dataDbRoute;
