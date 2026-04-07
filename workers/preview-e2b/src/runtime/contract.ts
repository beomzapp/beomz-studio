import {
  buildGeneratedManifest,
  buildGeneratedNavigationFromManifest,
  buildGeneratedRoutesFromManifest,
  readGeneratedManifestFromFiles,
} from "@beomz-studio/contracts";
import type {
  PreviewProvider,
  PreviewRuntimeContract,
  PreviewSession,
  Project,
  StudioFile,
} from "@beomz-studio/contracts";
import { getTemplateDefinition } from "@beomz-studio/templates";

export const PREVIEW_RUNTIME_CONTRACT_PATH = "apps/web/src/.beomz/runtime.json";
export const PREVIEW_BUILD_OUTPUT_DIRECTORY = "dist";

export function createRuntimeContract(input: {
  files?: readonly Pick<StudioFile, "path" | "content">[];
  mode: PreviewRuntimeContract["mode"];
  provider: PreviewProvider;
  project: Pick<Project, "id" | "name" | "templateId">;
  session?: PreviewSession;
}): PreviewRuntimeContract {
  const template = getTemplateDefinition(input.project.templateId);
  const manifest =
    (input.files ? readGeneratedManifestFromFiles(template.id, input.files) : null)
    ?? buildGeneratedManifest(template);
  const previewSession =
    input.session
    ?? {
      id: `preview-${input.project.id}`,
      projectId: input.project.id,
      provider: input.provider,
      entryPath: manifest.entryPath,
      status: "booting",
      createdAt: new Date().toISOString(),
    } satisfies PreviewSession;

  const manifestRoutes = buildGeneratedRoutesFromManifest(manifest);
  const manifestNavigation = buildGeneratedNavigationFromManifest(manifest);

  return {
    mode: input.mode,
    provider: input.provider,
    project: input.project,
    templateId: template.id,
    shell: manifest.shell,
    entryPath: manifest.entryPath,
    navigation: manifestNavigation,
    routes: manifestRoutes,
  };
}

export function serializeRuntimeContract(contract: PreviewRuntimeContract): string {
  return JSON.stringify(contract, null, 2);
}
