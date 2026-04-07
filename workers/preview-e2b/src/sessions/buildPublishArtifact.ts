import { Sandbox } from "e2b";

import type {
  Project,
  PublishArtifact,
  StudioFile,
} from "@beomz-studio/contracts";

import { getPreviewRuntimeConfig } from "../config.js";
import {
  createRuntimeContract,
  PREVIEW_BUILD_OUTPUT_DIRECTORY,
} from "../runtime/contract.js";
import {
  buildPreviewWorkspaceWrites,
  mergePreviewFiles,
} from "../runtime/files.js";

export interface BuildPublishArtifactInput {
  project: Pick<Project, "id" | "name" | "templateId">;
  generation: {
    id: string;
    files: readonly StudioFile[];
  };
  sandboxId?: string | null;
}

export async function buildPublishArtifact(
  input: BuildPublishArtifactInput,
): Promise<PublishArtifact> {
  const config = getPreviewRuntimeConfig();
  const sandbox = input.sandboxId
    ? await Sandbox.connect(input.sandboxId, {
      timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
    })
    : await Sandbox.create(config.E2B_PREVIEW_TEMPLATE, {
      metadata: {
        artifactGenerationId: input.generation.id,
        artifactProjectId: input.project.id,
      },
      timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
    });

  await sandbox.setTimeout(config.E2B_PREVIEW_TIMEOUT_MS);

  const runtime = createRuntimeContract({
    files: input.generation.files,
    mode: "publish",
    project: input.project,
    provider: "e2b",
  });
  const files = mergePreviewFiles(runtime, input.generation.files);
  const writes = buildPreviewWorkspaceWrites({
    files,
    runtime,
    workdir: config.E2B_PREVIEW_WORKDIR,
  });

  await sandbox.files.write(writes);
  await sandbox.commands.run("pnpm build", {
    cwd: config.E2B_PREVIEW_WORKDIR,
    timeoutMs: 300_000,
  });

  const tarballPath = `/tmp/beomz-publish-${input.generation.id}.tgz`;
  await sandbox.commands.run(
    `tar -czf ${tarballPath} -C ${config.E2B_PREVIEW_WORKDIR} ${PREVIEW_BUILD_OUTPUT_DIRECTORY}`,
    {
      timeoutMs: 120_000,
    },
  );

  return {
    outputDirectory: PREVIEW_BUILD_OUTPUT_DIRECTORY,
    runtime,
    tarballPath,
    tarballUrl: await sandbox.downloadUrl(tarballPath, {
      useSignatureExpiration: 600,
    }),
  };
}
