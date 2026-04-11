/**
 * GET /projects
 *
 * Returns all projects for the authenticated user's org, ordered by
 * last_opened_at desc (recently opened first) then updated_at desc.
 * Also returns the generation count per project.
 */
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { mapProjectRowToProject } from "../builds/shared.js";

const projectsRoute = new Hono();

projectsRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;

  const rows = await orgContext.db.findProjectsByOrgId(orgContext.org.id);

  // Fetch generation counts for all projects in one query.
  const genCounts = await orgContext.db.countGenerationsByProjectIds(
    rows.map((r) => r.id),
  );

  const projects = rows.map((row) => ({
    ...mapProjectRowToProject(row),
    generationCount: genCounts[row.id] ?? 0,
  }));

  return c.json({ projects });
});

export default projectsRoute;
