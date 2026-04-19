/**
 * GET /projects
 *
 * Returns all projects for the authenticated user's org, ordered by
 * last_opened_at desc (recently opened first) then updated_at desc.
 * Also returns the generation count per project and plan gate metadata.
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { mapProjectRowToProject } from "../builds/shared.js";
import { PLAN_LIMITS } from "../../lib/credits.js";
import {
  deleteSchemaRegistry,
  isUserDataConfigured,
  runSql,
} from "../../lib/userDataClient.js";
import { deleteNeonProject } from "../../lib/neonClient.js";

interface ProjectsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  isUserDataConfigured?: typeof isUserDataConfigured;
  runSql?: typeof runSql;
  deleteSchemaRegistry?: typeof deleteSchemaRegistry;
  deleteNeonProject?: typeof deleteNeonProject;
}

export function createProjectsRoute(deps: ProjectsRouteDeps = {}) {
  const projectsRoute = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const isUserDataConfiguredFn = deps.isUserDataConfigured ?? isUserDataConfigured;
  const runSqlFn = deps.runSql ?? runSql;
  const deleteSchemaRegistryFn = deps.deleteSchemaRegistry ?? deleteSchemaRegistry;
  const deleteNeonProjectFn = deps.deleteNeonProject ?? deleteNeonProject;

  projectsRoute.get("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({
      ...mapProjectRowToProject(project),
      // Extra fields not on the core Project type
      database_enabled: Boolean(project.database_enabled),
      db_provider: project.db_provider ?? null,
      db_wired: Boolean(project.db_wired),
      thumbnail_url: project.thumbnail_url ?? null,
      published: Boolean(project.published),
      published_slug: project.published_slug ?? null,
      beomz_app_url: project.beomz_app_url ?? null,
    });
  });

  projectsRoute.get("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;

    const rows = await orgContext.db.findProjectsByOrgId(orgContext.org.id);

    const genCounts = await orgContext.db.countGenerationsByProjectIds(
      rows.map((r) => r.id),
    );

    const projects = rows.map((row) => ({
      ...mapProjectRowToProject(row),
      generationCount: genCounts[row.id] ?? 0,
      // BEO-130: DB status for the frontend (no credentials, no nonce)
      database_enabled: Boolean(row.database_enabled),
      db_provider: row.db_provider ?? null,
      db_wired: Boolean(row.db_wired),
      // BEO-300: thumbnail for project cards
      thumbnail_url: row.thumbnail_url ?? null,
      // BEO-262: Publish
      published: Boolean(row.published),
      published_slug: row.published_slug ?? null,
      beomz_app_url: row.beomz_app_url ?? null,
    }));
    const plan = orgContext.org.plan ?? "free";
    const planLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free!;
    // Free plan is capped at 3 projects; paid plans are unlimited (-1 = unlimited)
    const maxProjects = plan === "free" ? 3 : -1;

    return c.json({
      projects,
      plan,
      maxProjects,
      canCreateMore: maxProjects === -1 || projects.length < maxProjects,
      planCredits: planLimit.credits,
    });
  });

  projectsRoute.delete("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    let neonProjectId: string | null = null;
    try {
      const dbWithLimits = orgContext.db as OrgContext["db"] & {
        getProjectDbLimits?: (projectId: string) => Promise<{ neon_project_id?: string | null } | null>;
      };
      const limits = await dbWithLimits.getProjectDbLimits?.(projectId);
      neonProjectId = typeof limits?.neon_project_id === "string" ? limits.neon_project_id : null;
    } catch (err) {
      console.error("[projects/delete] failed reading project_db_limits (non-fatal):", err);
    }

    await orgContext.db.deleteProject(projectId);

    try {
      const dbWithCleanup = orgContext.db as OrgContext["db"] & {
        deleteProjectDbLimits?: (projectId: string) => Promise<void>;
      };
      await dbWithCleanup.deleteProjectDbLimits?.(projectId);

      if (project.db_provider === "beomz" && isUserDataConfiguredFn()) {
        const schemasToDrop = new Set<string>([`project_${projectId}`]);
        if (project.db_schema) {
          schemasToDrop.add(project.db_schema);
        }

        for (const schemaName of schemasToDrop) {
          await runSqlFn(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
        }

        if (project.db_schema) {
          await deleteSchemaRegistryFn(project.db_schema);
        }
      }

      if (neonProjectId) {
        await deleteNeonProjectFn(neonProjectId).catch((err) => {
          console.error("[delete] Neon cleanup failed:", err);
          // Non-fatal
        });
      }
    } catch (err) {
      console.error("[projects/delete] cleanup error:", err);
      // Deletion should still succeed even if DB cleanup fails.
    }

    return c.json({ ok: true });
  });

  projectsRoute.patch("/:id", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const projectId = c.req.param("id");

    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json<{ name?: string }>();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "Name is required" }, 400);
    }

    await orgContext.db.updateProject(projectId, { name: body.name.trim() });

    return c.json({ ok: true });
  });

  return projectsRoute;
}

const projectsRoute = createProjectsRoute();

export default projectsRoute;
