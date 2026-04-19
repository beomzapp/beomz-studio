/**
 * GET /api/projects/:id/db/schema
 *
 * Returns the live tables + columns from the project's DB schema.
 * For managed (beomz) projects: queries beomz-user-data via Management API.
 * For BYO Supabase: queries via the anon key + information_schema REST endpoint.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { getSchemaTableList, isUserDataConfigured } from "../../lib/userDataClient.js";
import { getNeonSchemaTableList } from "../../lib/neonDb.js";
import { getNeonDbUrl, resolveProjectDbProvider } from "../../lib/projectDb.js";

interface SchemaDbRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  getSchemaTableList?: typeof getSchemaTableList;
  isUserDataConfigured?: typeof isUserDataConfigured;
  getNeonSchemaTableList?: typeof getNeonSchemaTableList;
}

export function createSchemaDbRoute(deps: SchemaDbRouteDeps = {}) {
  const schemaDbRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const getSchemaTableListFn = deps.getSchemaTableList ?? getSchemaTableList;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const getNeonSchemaTableListFn = deps.getNeonSchemaTableList ?? getNeonSchemaTableList;

  schemaDbRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
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

    const limits = await db.getProjectDbLimits(projectId);
    const provider = resolveProjectDbProvider(project, limits);

    if (provider === "beomz") {
      if (!isUserDataConfiguredFn()) {
        return c.json({ error: "Database service not configured" }, 503);
      }
      if (!project.db_schema) {
        return c.json({ tables: [] });
      }
      try {
        const tables = await getSchemaTableListFn(project.db_schema);
        return c.json({ tables });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to fetch schema" },
          500,
        );
      }
    }

    if (provider === "supabase") {
      const cfg = (project.db_config ?? {}) as Record<string, unknown>;
      const url = typeof cfg.url === "string" ? cfg.url : null;
      const anonKey = typeof cfg.anonKey === "string" ? cfg.anonKey : null;
      if (!url || !anonKey) {
        return c.json({ error: "BYO Supabase credentials missing" }, 400);
      }
      try {
        const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Accept: "application/openapi+json",
          },
        });
        if (!res.ok) {
          return c.json({ tables: [] });
        }
        const spec = (await res.json()) as {
          paths?: Record<string, unknown>;
          components?: { schemas?: Record<string, unknown> };
        };
        const tableNames = Object.keys(spec.paths ?? {})
          .map((p) => p.replace(/^\//, "").split("/")[0] ?? "")
          .filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && !n.startsWith("rpc"))
          .filter((v, i, a) => a.indexOf(v) === i)
          .sort();
        return c.json({ tables: tableNames.map((name) => ({ table_name: name, columns: [] })) });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to fetch schema" },
          500,
        );
      }
    }

    if (provider === "neon") {
      const dbUrl = getNeonDbUrl(limits);
      if (!dbUrl) {
        return c.json({ error: "Neon connection string missing" }, 400);
      }
      try {
        const tables = await getNeonSchemaTableListFn(dbUrl);
        return c.json({ tables });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to fetch schema" },
          500,
        );
      }
    }

    return c.json({ tables: [] });
  });

  return schemaDbRoute;
}

const schemaDbRoute = createSchemaDbRoute();

export default schemaDbRoute;
