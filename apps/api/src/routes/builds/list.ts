import type { GenerationRow } from "@beomz-studio/studio-db";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import { mapProjectRowToProject, readBuildMetadata } from "./shared.js";

/**
 * GET /projects/:projectId/builds
 *
 * Returns all builds for a project in chronological order.
 * Used by the History panel to show generation checkpoints.
 * Routes through the API (service role) to bypass Supabase RLS.
 */
const buildsListRoute = new Hono();

buildsListRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("projectId");

  if (!projectId) {
    return c.json({ error: "Project id is required." }, 400);
  }

  const projectRow = await orgContext.db.findProjectById(projectId);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found." }, 404);
  }

  const generationRows = await orgContext.db.listGenerationsByProjectId(projectId);

  const builds = generationRows.map((row: GenerationRow, index: number) => {
    const metadata = readBuildMetadata(row.metadata);
    return {
      id: row.id,
      projectId: row.project_id,
      turn: index + 1,
      prompt: row.prompt ?? "",
      summary: row.summary ?? null,
      status: row.status,
      fileCount: Array.isArray(row.output_paths) ? row.output_paths.length : 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      source: metadata.resultSource ?? null,
      templateId: row.template_id,
    };
  });

  return c.json({
    builds,
    project: mapProjectRowToProject(projectRow),
  });
});

export default buildsListRoute;
