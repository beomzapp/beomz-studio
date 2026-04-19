/**
 * GET /api/projects/:id/db/status
 *
 * Returns the database status for a project.
 * Includes env vars for WebContainer injection — authenticated project-owner only.
 * db_nonce is included in the env block for WC injection; it is NOT exposed
 * in the top-level response body and NOT stored in db_config.
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { getUserDataAnonKey, getUserDataPublicUrl, isUserDataConfigured } from "../../lib/userDataClient.js";

const statusDbRoute = new Hono();

statusDbRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const projectId = c.req.param("id") as string;
  const orgContext = c.get("orgContext") as OrgContext;
  const { db, org } = orgContext;

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!project.database_enabled) {
    return c.json({
      enabled: false,
      provider: null,
      wired: false,
    });
  }

  // Never return credentials for unwired projects.
  if (!project.db_wired) {
    return c.json({
      enabled: true,
      provider: project.db_provider,
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

  if (project.db_provider === "beomz" && project.db_schema && project.db_nonce) {
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
  } else if (project.db_provider === "supabase" && project.db_config) {
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
  } else if (project.db_provider === "neon") {
    // BEO-428: return the Neon connection string so the frontend can inject
    // VITE_DATABASE_URL into the WebContainer .env.local on every page load.
    const limits = await db.getProjectDbLimits(projectId);
    return c.json({
      enabled: true,
      provider: "neon",
      wired: true,
      dbUrl: limits?.db_url ?? null,
    });
  }

  return c.json({
    enabled: true,
    provider: project.db_provider,
    wired: true,
    supabaseUrl,
    anonKey,
    schemaName,
    schema: project.db_schema,
    env,
  });
});

export default statusDbRoute;
