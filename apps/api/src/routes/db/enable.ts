/**
 * POST /api/projects/:id/db/enable
 *
 * Provisions a built-in database schema for the project on beomz-user-data.
 * Plan-gated: free users can only have 1 DB-enabled project.
 *
 * Provisioning flow:
 *  1. Check plan — free users: count db-enabled projects, reject if >= 1
 *  2. Generate random schema name (app_ + 32 hex chars) + nonce (64 hex chars)
 *  3. CREATE SCHEMA on beomz-user-data via Management API
 *  4. CREATE/REPLACE beomz_db RPC (with nonce verification)
 *  5. INSERT INTO beomz_schema_registry (schema_name, nonce)
 *  6. exposeSchemaInPostgREST — GRANT + NOTIFY with 3×5s retry loop
 *  7. UPDATE projects SET db_schema, db_nonce, database_enabled=true, db_wired=false
 *  8. Return { status: 'connected' }
 *
 * Only set db_wired=true after successful wire — never here.
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  createBeomzDbFunction,
  exposeSchemaInPostgREST,
  insertSchemaRegistry,
  isUserDataConfigured,
  runSql,
} from "../../lib/userDataClient.js";

const enableDbRoute = new Hono();

enableDbRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (!isUserDataConfigured()) {
    return c.json({ error: "Database service not configured" }, 503);
  }

  const projectId = c.req.param("id") as string;
  const orgContext = c.get("orgContext") as OrgContext;
  const { db, org } = orgContext;

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (project.database_enabled) {
    return c.json({ status: "already_connected", provider: project.db_provider });
  }

  // Plan gate: free users may only have 1 DB-enabled project
  const plan = org.plan ?? "free";
  if (plan === "free") {
    const dbCount = await db.countDbEnabledProjectsByOrgId(org.id);
    if (dbCount >= 1) {
      return c.json(
        {
          error: "plan_limit",
          message: "Free plan allows 1 database-enabled project. Upgrade to enable more.",
        },
        403,
      );
    }
  }

  const schema = `app_${randomBytes(16).toString("hex")}`;
  const nonce = randomBytes(32).toString("hex");

  try {
    // 1. Create the schema
    await runSql(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);

    // 2. Create/replace beomz_db RPC (V2 with nonce verification)
    await createBeomzDbFunction();

    // 3. Register nonce in beomz_schema_registry (before exposing to PostgREST)
    await insertSchemaRegistry(schema, nonce, projectId);

    // 4. Expose schema to PostgREST with retry loop (fixes V1 PGRST106 race)
    await exposeSchemaInPostgREST(schema);

    // 5. Persist to project — db_nonce stored server-side only, never returned to client
    await db.updateProject(projectId, {
      database_enabled: true,
      db_schema: schema,
      db_nonce: nonce,
      db_provider: "beomz",
      db_config: null,
      db_wired: false,
    });

    return c.json({ status: "connected" });
  } catch (err) {
    console.error("[db/enable] provisioning failed:", err);
    // Best-effort cleanup
    try {
      await runSql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
    } catch {
      // ignore
    }
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to provision database" },
      500,
    );
  }
});

export default enableDbRoute;
