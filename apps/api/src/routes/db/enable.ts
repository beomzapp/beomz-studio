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
import type { StudioDbClient } from "@beomz-studio/studio-db";

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
import {
  enableNeonAuth,
  enableNeonDataApi,
  getNeonProjectBranches,
  provisionNeonProject,
} from "../../lib/neonClient.js";
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
  getNeonProjectBranches?: typeof getNeonProjectBranches;
  enableNeonAuth?: typeof enableNeonAuth;
  enableNeonDataApi?: typeof enableNeonDataApi;
  rewireNeonDb?: typeof rewireNeonDb;
}

type EnableDbServiceDeps = Omit<EnableDbRouteDeps, "authMiddleware" | "loadOrgContextMiddleware">;

type EnableDbDepsResolved = {
  authMiddleware: MiddlewareHandler;
  loadOrgContextMiddleware: MiddlewareHandler;
  isUserDataConfiguredFn: typeof isUserDataConfigured;
  runSqlFn: typeof runSql;
  createBeomzDbFunctionFn: typeof createBeomzDbFunction;
  insertSchemaRegistryFn: typeof insertSchemaRegistry;
  exposeSchemaInPostgRESTFn: typeof exposeSchemaInPostgREST;
  provisionNeonProjectFn: typeof provisionNeonProject;
  getNeonProjectBranchesFn: typeof getNeonProjectBranches;
  enableNeonAuthFn: typeof enableNeonAuth;
  enableNeonDataApiFn: typeof enableNeonDataApi;
  rewireNeonDbFn: typeof rewireNeonDb;
};

function resolveEnableDbDeps(deps: EnableDbRouteDeps = {}): EnableDbDepsResolved {
  return {
    authMiddleware: deps.authMiddleware ?? verifyPlatformJwt,
    loadOrgContextMiddleware: deps.loadOrgContextMiddleware ?? loadOrgContext,
    isUserDataConfiguredFn: deps.isUserDataConfigured ?? isUserDataConfigured,
    runSqlFn: deps.runSql ?? runSql,
    createBeomzDbFunctionFn: deps.createBeomzDbFunction ?? createBeomzDbFunction,
    insertSchemaRegistryFn: deps.insertSchemaRegistry ?? insertSchemaRegistry,
    exposeSchemaInPostgRESTFn: deps.exposeSchemaInPostgREST ?? exposeSchemaInPostgREST,
    provisionNeonProjectFn: deps.provisionNeonProject ?? provisionNeonProject,
    getNeonProjectBranchesFn: deps.getNeonProjectBranches ?? getNeonProjectBranches,
    enableNeonAuthFn: deps.enableNeonAuth ?? enableNeonAuth,
    enableNeonDataApiFn: deps.enableNeonDataApi ?? enableNeonDataApi,
    rewireNeonDbFn: deps.rewireNeonDb ?? rewireNeonDb,
  };
}

export async function provisionProjectDatabase(
  input: {
    db: StudioDbClient;
    orgId: string;
    projectId: string;
  },
  deps: EnableDbServiceDeps = {},
): Promise<{ body: Record<string, unknown>; status: number }> {
  const {
    isUserDataConfiguredFn,
    runSqlFn,
    createBeomzDbFunctionFn,
    insertSchemaRegistryFn,
    exposeSchemaInPostgRESTFn,
    provisionNeonProjectFn,
    getNeonProjectBranchesFn,
    enableNeonAuthFn,
    enableNeonDataApiFn,
    rewireNeonDbFn,
  } = resolveEnableDbDeps(deps);
  const { db, orgId, projectId } = input;
  const neonEnabled = Boolean(process.env.NEON_API_KEY);
  if (!neonEnabled && !isUserDataConfiguredFn()) {
    return { body: { error: "Database service not configured" }, status: 503 };
  }

  const project = await db.findProjectById(projectId);
  if (!project || project.org_id !== orgId) {
    return { body: { error: "Project not found" }, status: 404 };
  }

  if (project.database_enabled) {
    if (project.db_provider === "neon" && !project.db_wired) {
      const limits = await db.getProjectDbLimits(projectId).catch(() => null);
      const connectionUri = typeof limits?.db_url === "string" && limits.db_url.length > 0
        ? limits.db_url
        : null;
      if (connectionUri) {
        await rewireNeonDbFn(projectId, connectionUri);
        return {
          body: {
            success: true,
            db_provider: "neon",
            message: "Database provisioned successfully",
          },
          status: 200,
        };
      }
    }

    return {
      body: { status: "already_connected", provider: project.db_provider },
      status: 200,
    };
  }

  const org = await db.findOrgById(orgId);
  if (!org) {
    return { body: { error: "Org not found" }, status: 404 };
  }

  // Gate before provisioning starts: every plan includes 1 shared DB-enabled project.
  const plan = org.plan ?? "free";
  const limits = getFeatureLimits(plan);
  const dbProjects = await db.findProjectsByOrgId(org.id);
  const dbCount = countActiveDbEnabledProjects(
    dbProjects as unknown as ReadonlyArray<Record<string, unknown>>,
  );
  if (dbCount >= limits.db_projects) {
    return {
      body: {
        status: 402,
        error: "db_project_limit_reached",
        current: dbCount,
        limit: limits.db_projects,
        plan: org.plan,
      },
      status: 402,
    };
  }

  if (neonEnabled) {
    try {
      const projectName = `beomz-${project.id.slice(0, 12)}`;
      const { neonProjectId, connectionUri } = await provisionNeonProjectFn(projectName);
      const emptyNeonAuth = { baseUrl: "", pubClientKey: "", secretServerKey: "" };
      let branchId = "";
      let neonAuth = emptyNeonAuth;

      try {
        const branches = await getNeonProjectBranchesFn(neonProjectId);
        const mainBranch = branches.find((branch) => branch.default) ?? branches[0];
        branchId = mainBranch?.id ?? "";
        neonAuth = branchId
          ? await enableNeonAuthFn(neonProjectId, branchId)
          : emptyNeonAuth;
        if (branchId && neonAuth.baseUrl) {
          await enableNeonDataApiFn(neonProjectId, branchId);
        }
      } catch (authErr) {
        console.error("[db/enable] neon auth setup failed (non-fatal):", authErr);
        // Non-fatal — DB provisioning should still succeed
      }

      // Mark connected immediately; rewire helper finalizes db_wired + env context.
      await db.updateProject(projectId, {
        byo_db_url: null,
        byo_db_anon_key: null,
        byo_db_service_key: null,
        supabase_oauth_access_token: null,
        supabase_oauth_refresh_token: null,
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
          patch: {
            neon_project_id?: string | null;
            neon_branch_id?: string | null;
            db_url?: string | null;
            neon_auth_base_url?: string | null;
            neon_auth_pub_key?: string | null;
            neon_auth_secret_key?: string | null;
          },
        ) => Promise<void>;
      };
      await dbWithConnectionUpdate.updateProjectDbConnection?.(projectId, {
        neon_project_id: neonProjectId,
        neon_branch_id: branchId || null,
        db_url: connectionUri,
        neon_auth_base_url: neonAuth.baseUrl || null,
        neon_auth_pub_key: neonAuth.pubClientKey || null,
        neon_auth_secret_key: neonAuth.secretServerKey || null,
      });

      await rewireNeonDbFn(projectId, connectionUri);

      return {
        body: {
          success: true,
          db_provider: "neon",
          message: "Database provisioned successfully",
        },
        status: 200,
      };
    } catch (err) {
      console.error("[db/enable] neon provisioning failed:", err);
      return {
        body: { error: err instanceof Error ? err.message : "Failed to provision Neon database" },
        status: 500,
      };
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
      byo_db_url: null,
      byo_db_anon_key: null,
      byo_db_service_key: null,
      supabase_oauth_access_token: null,
      supabase_oauth_refresh_token: null,
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

    return { body: { status: "connected" }, status: 200 };
  } catch (err) {
    console.error("[db/enable] provisioning failed:", err);
    // Best-effort cleanup
    try {
      await runSqlFn(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
    } catch {
      // ignore
    }
    if (isRemovedResourceError(err)) {
      return {
        body: {
          error: "db_setup_failed",
          message: "Something went wrong setting up your database. Please try again.",
        },
        status: 400,
      };
    }
    return {
      body: { error: err instanceof Error ? err.message : "Failed to provision database" },
      status: 500,
    };
  }
}

export function createEnableDbRoute(deps: EnableDbRouteDeps = {}) {
  const enableDbRoute = new Hono();
  const {
    authMiddleware,
    loadOrgContextMiddleware,
  } = resolveEnableDbDeps(deps);

  enableDbRoute.post("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const projectId = c.req.param("id") as string;
    const orgContext = c.get("orgContext") as OrgContext;
    const result = await provisionProjectDatabase({
      db: orgContext.db,
      orgId: orgContext.org.id,
      projectId,
    }, deps);
    return c.json(result.body, result.status as 200 | 400 | 402 | 404 | 500 | 503);
  });

  return enableDbRoute;
}

const enableDbRoute = createEnableDbRoute();

export default enableDbRoute;
