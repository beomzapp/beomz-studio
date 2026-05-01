import type { StudioDbClient } from "@beomz-studio/studio-db";

import { createProjectVersion, type ProjectVersionFiles } from "../projectVersions.js";

type VersionAutosaveDb = Pick<StudioDbClient, "findGenerationById" | "findProjectById" | "updateGeneration">;

type VersionAutosaveFailure = {
  message: string;
  reason: "insert_failed" | "project_deleted";
  status: "failed";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function persistVersionAutosaveFailure(
  db: VersionAutosaveDb,
  buildId: string,
  failure: VersionAutosaveFailure,
): Promise<void> {
  try {
    const generation = await db.findGenerationById(buildId);
    if (!generation) {
      return;
    }

    const metadata = isRecord(generation.metadata) ? generation.metadata : {};
    await db.updateGeneration(buildId, {
      metadata: {
        ...metadata,
        versionAutoSave: {
          ...failure,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("[versions] failed to persist autosave failure metadata.", {
      buildId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function autoSaveProjectVersion(
  db: VersionAutosaveDb,
  args: {
    buildId: string;
    projectId: string;
    label: string;
    files: ProjectVersionFiles;
    createVersion?: typeof createProjectVersion;
  },
): Promise<void> {
  const {
    buildId,
    projectId,
    label,
    files,
    createVersion = createProjectVersion,
  } = args;

  const project = await db.findProjectById(projectId).catch(() => null);
  if (!project) {
    const message = "Project was deleted before version autosave.";
    console.warn("[versions] auto-save skipped because project no longer exists.", {
      buildId,
      projectId,
    });
    await persistVersionAutosaveFailure(db, buildId, {
      message,
      reason: "project_deleted",
      status: "failed",
    });
    return;
  }

  try {
    await createVersion(projectId, label, files);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Version autosave failed.";
    console.error("[versions] auto-save failed.", {
      buildId,
      projectId,
      error: message,
    });
    await persistVersionAutosaveFailure(db, buildId, {
      message,
      reason: "insert_failed",
      status: "failed",
    });
  }
}
