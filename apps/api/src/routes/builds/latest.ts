import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  buildInitialBuildOutput,
  mapProjectRowToProject,
  readBuildMetadata,
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

  const metadata = readBuildMetadata(generationRow.metadata);
  const trace = readBuildTraceMetadata(generationRow);

  return c.json({
    build: {
      completedAt: generationRow.completed_at,
      error: generationRow.error,
      id: generationRow.id,
      phase: metadata.phase ?? null,
      projectId: generationRow.project_id,
      source: metadata.resultSource ?? null,
      startedAt: generationRow.started_at,
      status: generationRow.status,
      summary: generationRow.summary,
      templateId: generationRow.template_id,
      templateReason: metadata.templateReason ?? null,
      workflowId: metadata.workflowId ?? null,
    },
    project: mapProjectRowToProject(projectRow),
    result: buildInitialBuildOutput(generationRow),
    trace,
  });
});

export default buildsLatestRoute;
