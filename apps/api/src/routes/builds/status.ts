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

const buildsStatusRoute = new Hono();

buildsStatusRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const buildId = c.req.param("id");

  if (!buildId) {
    return c.json({ error: "Build id is required." }, 400);
  }

  const generationRow = await orgContext.db.findGenerationById(buildId);
  if (!generationRow) {
    return c.json({ error: "Build not found." }, 404);
  }

  const projectRow = await orgContext.db.findProjectById(generationRow.project_id);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Build not found." }, 404);
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

export default buildsStatusRoute;
