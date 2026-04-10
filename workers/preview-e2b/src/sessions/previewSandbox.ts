import { Sandbox } from "e2b";

import type { Project } from "@beomz-studio/contracts";

import { getPreviewRuntimeConfig } from "../config.js";
import { VITE_REACT_TEMPLATE_VERSION } from "../templates/vite-react/templateVersion.js";

interface BuildPreviewSandboxMetadataInput {
  artifactGenerationId?: string;
  artifactProjectId?: string;
  generationId?: string;
  previewId?: string;
  project: Pick<Project, "id" | "templateId">;
}

export function buildPreviewSandboxMetadata(
  input: BuildPreviewSandboxMetadataInput,
): Record<string, string> {
  const config = getPreviewRuntimeConfig();

  return {
    ...(input.artifactGenerationId
      ? { artifactGenerationId: input.artifactGenerationId }
      : {}),
    ...(input.artifactProjectId
      ? { artifactProjectId: input.artifactProjectId }
      : {}),
    ...(input.generationId ? { generationId: input.generationId } : {}),
    ...(input.previewId ? { previewId: input.previewId } : {}),
    previewTemplateName: config.E2B_PREVIEW_TEMPLATE,
    previewTemplateVersion: VITE_REACT_TEMPLATE_VERSION,
    projectId: input.project.id,
    templateId: input.project.templateId,
  };
}

export async function connectCompatiblePreviewSandbox(
  sandboxId: string,
): Promise<Sandbox | null> {
  const config = getPreviewRuntimeConfig();

  try {
    const sandbox = await Sandbox.connect(sandboxId, {
      timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
    });
    await sandbox.setTimeout(config.E2B_PREVIEW_TIMEOUT_MS);

    const sandboxInfo = await sandbox.getInfo();
    const isCompatibleTemplate =
      sandboxInfo.metadata.previewTemplateName === config.E2B_PREVIEW_TEMPLATE
      && sandboxInfo.metadata.previewTemplateVersion === VITE_REACT_TEMPLATE_VERSION;

    if (isCompatibleTemplate) {
      return sandbox;
    }

    await sandbox.kill().catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

export async function createPreviewSandbox(
  metadata: Record<string, string>,
): Promise<Sandbox> {
  const config = getPreviewRuntimeConfig();

  return Sandbox.create(config.E2B_PREVIEW_TEMPLATE, {
    metadata,
    timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
  });
}
