/**
 * GET /api/projects/:id/db/status
 *
 * Returns the database status for a project.
 * Includes env vars for WebContainer injection — authenticated project-owner only.
 * db_nonce is included in the env block for WC injection; it is NOT exposed
 * in the top-level response body and NOT stored in db_config.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { getUserDataAnonKey, getUserDataPublicUrl, isUserDataConfigured } from "../../lib/userDataClient.js";
import { getByoSupabaseConfig, getProjectPostgresUrl, resolveProjectDbProvider } from "../../lib/projectDb.js";

interface StatusDbRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
}

export function createStatusDbRoute(deps: StatusDbRouteDeps = {}) {
  const statusDbRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;

  statusDbRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id") as string;
    const orgContext = c.get("orgContext") as OrgContext;
    const { db, org } = orgContext;

    const project = await db.findProjectById(projectId);
    if (!project || project.org_id !== org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const byoSupabase = getByoSupabaseConfig(project);
    if (byoSupabase) {
      return c.json({
        enabled: true,
        provider: "byo",
        wired: true,
        supabaseUrl: byoSupabase.supabaseUrl,
        anonKey: byoSupabase.supabaseAnonKey,
        schemaName: "public",
        byoDbHost: byoSupabase.host,
        env: {
          url: byoSupabase.supabaseUrl,
          anonKey: byoSupabase.supabaseAnonKey,
          dbSchema: "public",
          nonce: "",
        },
      });
    }

    if (!project.database_enabled) {
      return c.json({
        enabled: false,
        provider: null,
        wired: false,
      });
    }

    const limits = await db.getProjectDbLimits(projectId);
    const provider = resolveProjectDbProvider(project, limits);

    // Never return credentials for unwired projects.
    if (!project.db_wired) {
      return c.json({
        enabled: true,
        provider,
        wired: false,
      });
    }

    // Project is wired — build credentials block.
    let env: {
      url: string;
      anonKey: string;
      dbSchema: string;
      nonce: string;
    } | null = null;

    let supabaseUrl: string | null = null;
    let anonKey: string | null = null;
    let schemaName: string | null = null;

    if (provider === "beomz" && project.db_schema && project.db_nonce) {
      if (isUserDataConfigured()) {
        supabaseUrl = getUserDataPublicUrl();
        anonKey = getUserDataAnonKey();
        schemaName = project.db_schema;
        env = {
          url: supabaseUrl,
          anonKey,
          dbSchema: project.db_schema,
          nonce: project.db_nonce,
        };
      }
    } else if (provider === "supabase" && project.db_config) {
      const cfg = project.db_config as Record<string, unknown>;
      if (typeof cfg.url === "string" && typeof cfg.anonKey === "string") {
        supabaseUrl = cfg.url;
        anonKey = cfg.anonKey;
        schemaName = "public";
        env = {
          url: cfg.url,
          anonKey: cfg.anonKey,
          dbSchema: "public",
          nonce: "",
        };
      }
    } else if (provider === "neon" || provider === "postgres") {
      // BEO-428 / BEO-445: return the Postgres connection string so the
      // frontend can inject VITE_DATABASE_URL into the WebContainer .env.local.
      return c.json({
        enabled: true,
        provider,
        wired: true,
        dbUrl: getProjectPostgresUrl(project, limits),
      });
    }

    return c.json({
      enabled: true,
      provider,
      wired: true,
      supabaseUrl,
      anonKey,
      schemaName,
      schema: project.db_schema,
      env,
    });
  });

  return statusDbRoute;
}

const statusDbRoute = createStatusDbRoute();

export default statusDbRoute;
