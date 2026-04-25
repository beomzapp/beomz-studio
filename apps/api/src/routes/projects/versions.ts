import { randomUUID } from "node:crypto";

import type { StudioFile } from "@beomz-studio/contracts";
import { Hono } from "hono";

import {
  createProjectVersion,
  getProjectVersion,
  listProjectVersions,
  projectVersionFilesToStudioFiles,
  studioFilesToVersionFiles,
} from "../../lib/projectVersions.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const projectVersionsRoute = new Hono();

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function pickLatestProjectFiles(generations: Array<{ status: string; files: readonly StudioFile[] }>): StudioFile[] {
  for (let index = generations.length - 1; index >= 0; index -= 1) {
    const generation = generations[index];
    if (generation.status === "completed" && Array.isArray(generation.files) && generation.files.length > 0) {
      return [...generation.files];
    }
  }

  return [];
}

async function loadOwnedProject(orgContext: OrgContext, projectId: string) {
  const project = await orgContext.db.findProjectById(projectId);
  if (!project || project.org_id !== orgContext.org.id) {
    return null;
  }

  return project;
}

projectVersionsRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id");

  if (!projectId) {
    return c.json({ error: "Project id is required." }, 400);
  }

  const project = await loadOwnedProject(orgContext, projectId);
  if (!project) {
    return c.json({ error: "Project not found." }, 404);
  }

  const body = await c.req.json<{ label?: unknown; files?: unknown }>().catch(() => null);
  if (!body || typeof body.label !== "string" || !isStringRecord(body.files)) {
    return c.json({ error: "Body must include label:string and files:Record<string,string>." }, 400);
  }

  try {
    const version = await createProjectVersion(projectId, body.label, body.files);
    return c.json({
      id: version.id,
      version_number: version.version_number,
      label: version.label,
      file_count: version.file_count,
      created_at: version.created_at,
    });
  } catch (error) {
    console.error("[versions] create failed:", error);
    return c.json({ error: "Failed to create project version." }, 500);
  }
});

projectVersionsRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id");

  if (!projectId) {
    return c.json({ error: "Project id is required." }, 400);
  }

  const project = await loadOwnedProject(orgContext, projectId);
  if (!project) {
    return c.json({ error: "Project not found." }, 404);
  }

  try {
    return c.json(await listProjectVersions(projectId));
  } catch (error) {
    console.error("[versions] list failed:", error);
    return c.json({ error: "Failed to load project versions." }, 500);
  }
});

projectVersionsRoute.get("/:versionId", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id");
  const versionId = c.req.param("versionId");

  if (!projectId || !versionId) {
    return c.json({ error: "Project id and version id are required." }, 400);
  }

  const project = await loadOwnedProject(orgContext, projectId);
  if (!project) {
    return c.json({ error: "Project not found." }, 404);
  }

  try {
    const version = await getProjectVersion(projectId, versionId);
    if (!version) {
      return c.json({ error: "Version not found." }, 404);
    }

    return c.json(version);
  } catch (error) {
    console.error("[versions] get failed:", error);
    return c.json({ error: "Failed to load project version." }, 500);
  }
});

projectVersionsRoute.post("/:versionId/restore", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id");
  const versionId = c.req.param("versionId");

  if (!projectId || !versionId) {
    return c.json({ error: "Project id and version id are required." }, 400);
  }

  const project = await loadOwnedProject(orgContext, projectId);
  if (!project) {
    return c.json({ error: "Project not found." }, 404);
  }

  try {
    const version = await getProjectVersion(projectId, versionId);
    if (!version) {
      return c.json({ error: "Version not found." }, 404);
    }

    const generations = await orgContext.db.listGenerationsByProjectId(projectId);
    const currentFiles = pickLatestProjectFiles(generations);
    if (currentFiles.length === 0) {
      return c.json({ error: "No current project files found." }, 404);
    }

    const latestCompletedGeneration = [...generations]
      .reverse()
      .find((generation) => generation.status === "completed" && Array.isArray(generation.files) && generation.files.length > 0);

    if (!latestCompletedGeneration) {
      return c.json({ error: "No completed build found for this project." }, 404);
    }

    const savedVersion = await createProjectVersion(
      projectId,
      `Before restore to v${version.version_number}`,
      studioFilesToVersionFiles(currentFiles),
    );

    const restoredAt = new Date().toISOString();
    const restoredFiles = projectVersionFilesToStudioFiles(version.files, currentFiles);

    await orgContext.db.createGeneration({
      id: randomUUID(),
      project_id: projectId,
      template_id: latestCompletedGeneration.template_id,
      operation_id: latestCompletedGeneration.operation_id,
      status: "completed",
      prompt: `Restore to version v${version.version_number}`,
      started_at: restoredAt,
      completed_at: restoredAt,
      output_paths: restoredFiles.map((file) => file.path),
      summary: `Restored project to version v${version.version_number}.`,
      error: null,
      preview_entry_path: latestCompletedGeneration.preview_entry_path,
      warnings: latestCompletedGeneration.warnings,
      files: restoredFiles,
      metadata: {
        ...(typeof latestCompletedGeneration.metadata === "object" && latestCompletedGeneration.metadata !== null
          ? latestCompletedGeneration.metadata
          : {}),
        checkpointAction: "version_restore",
        restoredAt,
        restoredFromVersionId: version.id,
        restoredFromVersionNumber: version.version_number,
        savedVersionId: savedVersion.id,
        savedVersionNumber: savedVersion.version_number,
      },
      session_events: latestCompletedGeneration.session_events,
    });

    await orgContext.db.updateProject(projectId, {
      status: "ready",
      template: latestCompletedGeneration.template_id,
      updated_at: restoredAt,
    });

    return c.json({
      restoredVersionNumber: version.version_number,
      savedVersionNumber: savedVersion.version_number,
    });
  } catch (error) {
    console.error("[versions] restore failed:", error);
    return c.json({ error: "Failed to restore project version." }, 500);
  }
});

export default projectVersionsRoute;
