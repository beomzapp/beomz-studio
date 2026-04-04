import { randomUUID } from "node:crypto";

import {
  type StudioFile,
  type StudioFileKind,
  type GenerationStatus,
} from "@beomz-studio/contracts";
import {
  VirtualFileSystem,
  type VirtualFileSystemSnapshot,
} from "@beomz-studio/engine";
import type { GenerationRow, ProjectRow } from "@beomz-studio/studio-db";
import { Hono } from "hono";
import { z } from "zod";

import { loadOrgContext } from "../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../types.js";

const checkpointsRoute = new Hono();

const forkCheckpointRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000).optional(),
});

const checkpointStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]) satisfies z.ZodType<GenerationStatus>;

const virtualFileEntrySchema = z.object({
  content: z.string(),
  path: z.string().trim().min(1),
});

const virtualFileSystemSnapshotSchema = z.object({
  version: z.number().int().min(0),
  files: z.array(virtualFileEntrySchema),
}) satisfies z.ZodType<VirtualFileSystemSnapshot>;

function inferLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "tsx":
    case "ts":
    case "jsx":
    case "js":
    case "json":
    case "css":
    case "scss":
    case "html":
    case "md":
    case "mdx":
    case "txt":
    case "svg":
      return extension;
    default:
      return extension && extension.length > 0 ? extension : "txt";
  }
}

function inferFileKind(filePath: string): StudioFileKind {
  const normalized = filePath.toLowerCase();
  const baseName = normalized.split("/").pop() ?? normalized;

  if (baseName.startsWith("layout.")) {
    return "layout";
  }

  if (
    normalized.includes("/app/generated/")
    || normalized.includes("/pages/")
    || normalized.includes("/routes/")
  ) {
    return "route";
  }

  if (normalized.includes("/components/")) {
    return "component";
  }

  if (
    normalized.includes("/styles/")
    || normalized.endsWith(".css")
    || normalized.endsWith(".scss")
  ) {
    return "style";
  }

  if (
    normalized.endsWith(".json")
    || normalized.endsWith(".yaml")
    || normalized.endsWith(".yml")
    || normalized.endsWith(".toml")
    || baseName === "package.json"
    || baseName === "tsconfig.json"
  ) {
    return "config";
  }

  if (
    normalized.endsWith(".md")
    || normalized.endsWith(".mdx")
    || normalized.endsWith(".txt")
    || normalized.endsWith(".html")
  ) {
    return "content";
  }

  return "data";
}

function buildSnapshotFromFiles(files: readonly StudioFile[]): VirtualFileSystemSnapshot | null {
  if (files.length === 0) {
    return null;
  }

  return {
    files: files.map((file) => ({
      content: file.content,
      path: file.path,
    })),
    version: 0,
  };
}

function buildFilesFromSnapshot(
  snapshot: VirtualFileSystemSnapshot,
  sourceFiles: readonly StudioFile[],
): readonly StudioFile[] {
  const sourceFileByPath = new Map(sourceFiles.map((file) => [file.path, file]));

  return snapshot.files.map((entry) => {
    const sourceFile = sourceFileByPath.get(entry.path);
    if (sourceFile) {
      return {
        ...sourceFile,
        content: entry.content,
      };
    }

    return {
      content: entry.content,
      kind: inferFileKind(entry.path),
      language: inferLanguage(entry.path),
      locked: false,
      path: entry.path,
      source: "ai",
    } satisfies StudioFile;
  });
}

function extractSnapshot(generation: GenerationRow): VirtualFileSystemSnapshot | null {
  const parsedSnapshot = virtualFileSystemSnapshotSchema.safeParse(generation.vfs_snapshot);
  if (parsedSnapshot.success) {
    return parsedSnapshot.data;
  }

  if (typeof generation.metadata === "object" && generation.metadata !== null) {
    const metadataSnapshot = virtualFileSystemSnapshotSchema.safeParse(
      (generation.metadata as Record<string, unknown>).vfsSnapshot,
    );
    if (metadataSnapshot.success) {
      return metadataSnapshot.data;
    }
  }

  return buildSnapshotFromFiles(generation.files);
}

function getFileCount(generation: GenerationRow, snapshot: VirtualFileSystemSnapshot | null): number {
  if (snapshot) {
    return snapshot.files.length;
  }

  if (generation.files.length > 0) {
    return generation.files.length;
  }

  return generation.output_paths.length;
}

async function loadOwnedProject(
  orgContext: OrgContext,
  projectId: string,
): Promise<ProjectRow | null> {
  const projectRow = await orgContext.db.findProjectById(projectId);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return null;
  }

  return projectRow;
}

async function loadOwnedGeneration(
  orgContext: OrgContext,
  generationId: string,
): Promise<{ generation: GenerationRow; project: ProjectRow } | null> {
  const generation = await orgContext.db.findGenerationById(generationId);
  if (!generation) {
    return null;
  }

  const project = await loadOwnedProject(orgContext, generation.project_id);
  if (!project) {
    return null;
  }

  return { generation, project };
}

checkpointsRoute.get("/:projectId", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("projectId");
  const project = await loadOwnedProject(orgContext, projectId);

  if (!project) {
    return c.json({ error: "Project not found." }, 404);
  }

  const generations = await orgContext.db.findGenerationsByProjectId(project.id);
  const checkpoints = generations.map((generation) => {
    const snapshot = extractSnapshot(generation);

    return {
      created_at: generation.started_at,
      file_count: getFileCount(generation, snapshot),
      id: generation.id,
      prompt: generation.prompt,
      status: checkpointStatusSchema.parse(generation.status),
      vfs_snapshot: snapshot,
    };
  });

  return c.json({ checkpoints });
});

checkpointsRoute.post("/:id/restore", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const generationId = c.req.param("id");
  const loaded = await loadOwnedGeneration(orgContext, generationId);

  if (!loaded) {
    return c.json({ error: "Checkpoint not found." }, 404);
  }

  const snapshot = extractSnapshot(loaded.generation);
  if (!snapshot) {
    return c.json({ error: "Checkpoint does not contain a restorable snapshot." }, 409);
  }

  const vfs = new VirtualFileSystem();
  vfs.restore(snapshot);

  await orgContext.db.updateProject(loaded.project.id, {
    updated_at: new Date().toISOString(),
  });

  return c.json({
    generation_id: loaded.generation.id,
    restoredAt: new Date().toISOString(),
    success: true,
  });
});

checkpointsRoute.post("/:id/fork", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const generationId = c.req.param("id");
  const loaded = await loadOwnedGeneration(orgContext, generationId);

  if (!loaded) {
    return c.json({ error: "Checkpoint not found." }, 404);
  }

  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = forkCheckpointRequestSchema.safeParse(requestBody ?? {});

  if (!parsedBody.success) {
    return c.json(
      {
        details: parsedBody.error.flatten(),
        error: "Invalid fork request body.",
      },
      400,
    );
  }

  const snapshot = extractSnapshot(loaded.generation);
  if (!snapshot) {
    return c.json({ error: "Checkpoint does not contain a forkable snapshot." }, 409);
  }

  const vfs = new VirtualFileSystem();
  vfs.restore(snapshot);

  const newProjectId = randomUUID();
  const newGenerationId = randomUUID();
  const now = new Date().toISOString();
  const forkedPrompt = parsedBody.data.prompt?.trim() || loaded.generation.prompt;
  const forkedFiles = buildFilesFromSnapshot(snapshot, loaded.generation.files);

  await orgContext.db.createProject({
    id: newProjectId,
    name: `${loaded.project.name} Fork`,
    org_id: orgContext.org.id,
    status: "ready",
    template: loaded.project.template,
  });

  await orgContext.db.createGeneration({
    completed_at: now,
    error: null,
    files: forkedFiles,
    id: newGenerationId,
    metadata: {
      forkedFromGenerationId: loaded.generation.id,
      forkedFromProjectId: loaded.project.id,
      phase: "checkpoint-fork",
      vfsSnapshot: snapshot,
    },
    operation_id: loaded.generation.operation_id,
    output_paths: forkedFiles.map((file) => file.path),
    preview_entry_path: loaded.generation.preview_entry_path,
    project_id: newProjectId,
    prompt: forkedPrompt,
    started_at: now,
    status: "completed",
    summary: `Forked from checkpoint ${loaded.generation.id}.`,
    template_id: loaded.generation.template_id,
    warnings: loaded.generation.warnings,
  });

  return c.json({
    buildId: newGenerationId,
    generation_id: newGenerationId,
    new_project_id: newProjectId,
    projectId: newProjectId,
    success: true,
  });
});

export default checkpointsRoute;
