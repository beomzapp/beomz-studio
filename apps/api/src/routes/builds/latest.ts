import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  buildInitialBuildOutput,
  mapGenerationRowToBuild,
  mapProjectRowToProject,
  readBuildTraceMetadata,
} from "./shared.js";

/**
 * GET /projects/:projectId/latest-build
 *
 * Returns the latest build for a project. Used by the studio client to resume
 * sessions without direct Supabase table access (which requires RLS policies).
 */
const buildsLatestRoute = new Hono();

buildsLatestRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("projectId");

  if (!projectId) {
    return c.json({ error: "Project id is required." }, 400);
  }

  const projectRow = await orgContext.db.findProjectById(projectId);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found." }, 404);
  }

  const generationRow = await orgContext.db.findLatestGenerationByProjectId(projectId);
  if (!generationRow) {
    return c.json({ build: null, project: mapProjectRowToProject(projectRow), result: null, trace: null });
  }

  // Fire-and-forget: stamp last_opened_at so the dashboard shows "recently opened"
  void orgContext.db.touchProjectLastOpened(projectId);

  const trace = readBuildTraceMetadata(generationRow);

  return c.json({
    build: mapGenerationRowToBuild(generationRow),
    project: mapProjectRowToProject(projectRow),
    result: buildInitialBuildOutput(generationRow),
    trace,
  });
});

export default buildsLatestRoute;
