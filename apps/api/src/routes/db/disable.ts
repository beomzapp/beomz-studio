/**
 * POST /api/projects/:id/db/disable
 *
 * Removes the built-in database from a project:
 *  1. DROP SCHEMA ... CASCADE on beomz-user-data
 *  2. Delete from beomz_schema_registry
 *  3. Clear db_* columns on the project
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { deleteSchemaRegistry, isUserDataConfigured, runSql } from "../../lib/userDataClient.js";

const disableDbRoute = new Hono();

disableDbRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const projectId = c.req.param("id") as string;
  const orgContext = c.get("orgContext") as OrgContext;
  const { db, org } = orgContext;

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found" }, 404);
  }
  if (!project.database_enabled) {
    return c.json({ status: "already_disabled" });
  }

  // Drop managed schema
  if (project.db_provider === "beomz" && project.db_schema) {
    if (isUserDataConfigured()) {
      try {
        await runSql(`DROP SCHEMA IF EXISTS "${project.db_schema}" CASCADE;`);
        await deleteSchemaRegistry(project.db_schema);
      } catch (err) {
        console.error("[db/disable] cleanup error:", err);
        // Continue — clear DB flags regardless
      }
    }
  }

  await db.updateProject(projectId, {
    byo_db_url: null,
    database_enabled: false,
    db_schema: null,
    db_nonce: null,
    db_provider: null,
    db_config: null,
    db_wired: false,
  });

  return c.json({ status: "disabled" });
});

export default disableDbRoute;
