import { randomUUID } from "node:crypto";

import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  mapGenerationRowToBuild,
  mapProjectRowToProject,
} from "./shared.js";

const buildsRestoreRoute = new Hono();

buildsRestoreRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
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
    return c.json({ error: "Only completed builds can be restored." }, 409);
  }

  const restoredAt = new Date().toISOString();
  const restoredBuildRow = await orgContext.db.createGeneration({
    completed_at: restoredAt,
    error: null,
    files: sourceBuildRow.files,
    id: randomUUID(),
    metadata: {
      checkpointAction: "restore",
      phase: "restored",
      restoredAt,
      restoredFromBuildId: sourceBuildRow.id,
      restoredFromProjectId: sourceProjectRow.id,
    },
    operation_id: sourceBuildRow.operation_id,
    output_paths: sourceBuildRow.output_paths,
    preview_entry_path: sourceBuildRow.preview_entry_path,
    project_id: sourceProjectRow.id,
    prompt: `Restore checkpoint from build ${sourceBuildRow.id}`,
    started_at: restoredAt,
    status: "completed",
    summary: `Restored project from build ${sourceBuildRow.id}.`,
    template_id: sourceBuildRow.template_id,
    warnings: sourceBuildRow.warnings,
  });

  const restoredProjectRow = await orgContext.db.updateProject(sourceProjectRow.id, {
    status: "ready",
    template: sourceBuildRow.template_id,
    updated_at: restoredAt,
  });

  if (!restoredProjectRow) {
    return c.json({ error: "Build not found." }, 404);
  }

  return c.json({
    build: mapGenerationRowToBuild(restoredBuildRow),
    project: mapProjectRowToProject(restoredProjectRow),
  });
});

export default buildsRestoreRoute;
