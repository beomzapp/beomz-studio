import { randomUUID } from "node:crypto";

import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  mapGenerationRowToBuild,
  mapProjectRowToProject,
} from "./shared.js";

function buildForkProjectName(projectName: string): string {
  return projectName.endsWith(" (Fork)")
    ? `${projectName} Copy`
    : `${projectName} (Fork)`;
}

const buildsForkRoute = new Hono();

buildsForkRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const sourceBuildId = c.req.param("id");

  if (!sourceBuildId) {
    return c.json({ error: "Build id is required." }, 400);
  }

  const sourceBuildRow = await orgContext.db.findGenerationById(sourceBuildId);
  if (!sourceBuildRow) {
    return c.json({ error: "Build not found." }, 404);
  }

  const sourceProjectRow = await orgContext.db.findProjectById(sourceBuildRow.project_id);
  if (!sourceProjectRow || sourceProjectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Build not found." }, 404);
  }

  if (sourceBuildRow.status !== "completed") {
    return c.json({ error: "Only completed builds can be forked." }, 409);
  }

  const forkedAt = new Date().toISOString();
  const forkedProjectRow = await orgContext.db.createProject({
    id: randomUUID(),
    name: buildForkProjectName(sourceProjectRow.name),
    org_id: orgContext.org.id,
    project_type: sourceProjectRow.project_type ?? "app",
    status: "ready",
    template: sourceBuildRow.template_id,
  });

  const forkedBuildRow = await orgContext.db.createGeneration({
    completed_at: forkedAt,
    error: null,
    files: sourceBuildRow.files,
    id: randomUUID(),
    metadata: {
      checkpointAction: "fork",
      forkedAt,
      forkedFromBuildId: sourceBuildRow.id,
      forkedFromProjectId: sourceProjectRow.id,
      phase: "forked",
    },
    operation_id: sourceBuildRow.operation_id,
    output_paths: sourceBuildRow.output_paths,
    preview_entry_path: sourceBuildRow.preview_entry_path,
    project_id: forkedProjectRow.id,
    prompt: `Fork checkpoint from build ${sourceBuildRow.id}`,
    started_at: forkedAt,
    status: "completed",
    summary: `Forked from build ${sourceBuildRow.id}.`,
    template_id: sourceBuildRow.template_id,
    warnings: sourceBuildRow.warnings,
  });

  return c.json(
    {
      build: mapGenerationRowToBuild(forkedBuildRow),
      project: mapProjectRowToProject(forkedProjectRow),
    },
    201,
  );
});

export default buildsForkRoute;
