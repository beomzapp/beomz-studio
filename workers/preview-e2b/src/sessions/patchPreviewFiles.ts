import { Sandbox } from "e2b";

import type {
  PreviewPatch,
  PreviewRuntimeContract,
  PreviewSession,
  Project,
  StudioFile,
} from "@beomz-studio/contracts";

import { getPreviewRuntimeConfig } from "../config.js";
import { createRuntimeContract } from "../runtime/contract.js";
import {
  buildPreviewWorkspaceWrites,
  mergePreviewFiles,
} from "../runtime/files.js";

export interface PatchPreviewFilesInput {
  previewId: string;
  project: Pick<Project, "id" | "name" | "templateId">;
  generation: {
    id: string;
    files: readonly StudioFile[];
  };
  sandboxId: string;
}

export interface PatchPreviewFilesResult {
  patch: PreviewPatch;
  runtime: PreviewRuntimeContract;
  session: PreviewSession;
}

export async function patchPreviewFiles(
  input: PatchPreviewFilesInput,
): Promise<PatchPreviewFilesResult> {
  const config = getPreviewRuntimeConfig();
  const sandbox = await Sandbox.connect(input.sandboxId, {
    timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
  });

  await sandbox.setTimeout(config.E2B_PREVIEW_TIMEOUT_MS);

  const provisionalSession = {
    createdAt: new Date().toISOString(),
    entryPath: "/",
    id: input.previewId,
    projectId: input.project.id,
    provider: "e2b",
    sandboxId: input.sandboxId,
    status: "running",
  } satisfies PreviewSession;
  const runtime = createRuntimeContract({
    files: input.generation.files,
    mode: "preview",
    project: input.project,
    provider: "e2b",
    session: provisionalSession,
  });
  const files = mergePreviewFiles(runtime, input.generation.files);
  const writes = buildPreviewWorkspaceWrites({
    files,
    runtime,
    workdir: config.E2B_PREVIEW_WORKDIR,
  });

  await sandbox.files.write(writes);

  const sandboxInfo = await sandbox.getInfo();
  const previewUrl = new URL("/", `https://${sandbox.getHost(config.E2B_PREVIEW_PORT)}`).toString();

  return {
    patch: {
      createdAt: new Date().toISOString(),
      files: files.map((file) => ({
        content: file.content,
        kind: file.kind,
        path: file.path,
      })),
      restartRequired: false,
      sessionId: input.previewId,
    },
    runtime,
    session: {
      ...provisionalSession,
      createdAt: sandboxInfo.startedAt.toISOString(),
      entryPath: runtime.entryPath,
      expiresAt: sandboxInfo.endAt.toISOString(),
      url: previewUrl,
    },
  };
}
