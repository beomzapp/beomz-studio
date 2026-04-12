/**
 * GET /projects
 *
 * Returns all projects for the authenticated user's org, ordered by
 * last_opened_at desc (recently opened first) then updated_at desc.
 * Also returns the generation count per project and plan gate metadata.
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { mapProjectRowToProject } from "../builds/shared.js";
import { PLAN_LIMITS } from "../../lib/credits.js";

const projectsRoute = new Hono();

projectsRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
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

projectsRoute.delete("/:id", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id");

  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found" }, 404);
  }

  await orgContext.db.deleteProject(projectId);

  return c.json({ ok: true });
});

projectsRoute.patch("/:id", verifyPlatformJwt, loadOrgContext, async (c) => {
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

export default projectsRoute;
