/**
 * POST /api/projects/:id/db/enable
 *
 * Provisions a built-in database schema for the project on beomz-user-data.
 * Plan-gated: every plan includes 1 DB-enabled project.
 *
 * Provisioning flow:
 *  1. Check org DB-enabled project count, reject if the plan cap is reached
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
import type { MiddlewareHandler } from "hono";

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
import { getFeatureLimits } from "../../lib/features.js";
import { provisionNeonProject } from "../../lib/neonClient.js";
import { rewireNeonDb } from "./rewire-neon.js";

export function countActiveDbEnabledProjects(
  projects: ReadonlyArray<Record<string, unknown>>,
): number {
  return projects.filter((project) => {
    const deletedAt = project.deleted_at;
    const isDeleted = typeof deletedAt === "string" ? deletedAt.length > 0 : deletedAt != null;
    return project.database_enabled === true && !isDeleted;
  }).length;
}

function isRemovedResourceError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("Resource has been removed");
}

interface EnableDbRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  isUserDataConfigured?: typeof isUserDataConfigured;
  runSql?: typeof runSql;
  createBeomzDbFunction?: typeof createBeomzDbFunction;
  insertSchemaRegistry?: typeof insertSchemaRegistry;
  exposeSchemaInPostgREST?: typeof exposeSchemaInPostgREST;
  provisionNeonProject?: typeof provisionNeonProject;
  rewireNeonDb?: typeof rewireNeonDb;
}

export function createEnableDbRoute(deps: EnableDbRouteDeps = {}) {
  const enableDbRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const runSqlFn = deps.runSql ?? runSql;
  const createBeomzDbFunctionFn = deps.createBeomzDbFunction ?? createBeomzDbFunction;
  const insertSchemaRegistryFn = deps.insertSchemaRegistry ?? insertSchemaRegistry;
  const exposeSchemaInPostgRESTFn = deps.exposeSchemaInPostgREST ?? exposeSchemaInPostgREST;
  const provisionNeonProjectFn = deps.provisionNeonProject ?? provisionNeonProject;
  const rewireNeonDbFn = deps.rewireNeonDb ?? rewireNeonDb;

  enableDbRoute.post("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const neonEnabled = Boolean(process.env.NEON_API_KEY);
    if (!neonEnabled && !isUserDataConfiguredFn()) {
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

    // Gate before provisioning starts: every plan includes 1 shared DB-enabled project.
    const plan = org.plan ?? "free";
    const limits = getFeatureLimits(plan);
    const dbProjects = await db.findProjectsByOrgId(org.id);
    const dbCount = countActiveDbEnabledProjects(
      dbProjects as unknown as ReadonlyArray<Record<string, unknown>>,
    );
    if (dbCount >= limits.db_projects) {
      return c.json(
        {
          status: 402,
          error: "db_project_limit_reached",
          current: dbCount,
          limit: limits.db_projects,
          plan: org.plan,
        },
        402,
      );
    }

    if (neonEnabled) {
      try {
        const projectName = `beomz-${project.id.slice(0, 12)}`;
        const { neonProjectId, connectionUri } = await provisionNeonProjectFn(projectName);

        // Mark connected immediately; rewire helper finalizes db_wired + env context.
        await db.updateProject(projectId, {
          database_enabled: true,
          db_provider: "neon",
          db_wired: false,
          db_schema: null,
          db_nonce: null,
          db_config: null,
        });

        try {
          await db.insertProjectDbLimits(
            projectId,
            limits.storage_mb,
            limits.rows ?? 0,
            limits.tables ?? 0,
          );
        } catch (limitsErr) {
          // Non-fatal: row may already exist.
          console.warn("[db/enable] insertProjectDbLimits failed (non-fatal):", limitsErr);
        }

        // Best-effort metadata write for Neon linkage columns.
        const dbWithConnectionUpdate = db as typeof db & {
          updateProjectDbConnection?: (
            projectId: string,
            patch: { neon_project_id?: string | null; db_url?: string | null },
          ) => Promise<void>;
        };
        await dbWithConnectionUpdate.updateProjectDbConnection?.(projectId, {
          neon_project_id: neonProjectId,
          db_url: connectionUri,
        });

        await rewireNeonDbFn(projectId, connectionUri);

        return c.json({
          success: true,
          db_provider: "neon",
          message: "Database provisioned successfully",
        });
      } catch (err) {
        console.error("[db/enable] neon provisioning failed:", err);
        return c.json(
          { error: err instanceof Error ? err.message : "Failed to provision Neon database" },
          500,
        );
      }
    }

    const schema = `app_${randomBytes(16).toString("hex")}`;
    const nonce = randomBytes(32).toString("hex");

    try {
      // 1. Create the schema
      await runSqlFn(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);

      // 2. Create/replace beomz_db RPC (V2 with nonce verification)
      await createBeomzDbFunctionFn();

      // 3. Register nonce in beomz_schema_registry (before exposing to PostgREST)
      await insertSchemaRegistryFn(schema, nonce, projectId);

      // 4. Expose schema to PostgREST with retry loop (fixes V1 PGRST106 race)
      await exposeSchemaInPostgRESTFn(schema);

      // 5. Persist to project — db_nonce stored server-side only, never returned to client
      await db.updateProject(projectId, {
        database_enabled: true,
        db_schema: schema,
        db_nonce: nonce,
        db_provider: "beomz",
        db_config: null,
        db_wired: false,
      });

      // 6. Insert plan-based DB limits for this project (idempotent ON CONFLICT via UNIQUE)
      try {
        await db.insertProjectDbLimits(
          projectId,
          limits.storage_mb,
          limits.rows ?? 0,
          limits.tables ?? 0,
        );
      } catch (limitsErr) {
        // Non-fatal — log but don't fail provisioning
        console.warn("[db/enable] insertProjectDbLimits failed (non-fatal):", limitsErr);
      }

      return c.json({ status: "connected" });
    } catch (err) {
      console.error("[db/enable] provisioning failed:", err);
      // Best-effort cleanup
      try {
        await runSqlFn(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
      } catch {
        // ignore
      }
      if (isRemovedResourceError(err)) {
        return c.json(
          {
            error: "db_setup_failed",
            message: "Something went wrong setting up your database. Please try again.",
          },
          400,
        );
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to provision database" },
        500,
      );
    }
  });

  return enableDbRoute;
}

const enableDbRoute = createEnableDbRoute();

export default enableDbRoute;
