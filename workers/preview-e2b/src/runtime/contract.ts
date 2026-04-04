import {
  createPreviewBootstrap,
  createPublishBootstrap,
} from "@beomz-studio/kernel";
import type {
  PreviewProvider,
  PreviewRuntimeContract,
  PreviewSession,
  Project,
  TemplateId,
} from "@beomz-studio/contracts";
import { getTemplateDefinition } from "@beomz-studio/templates";

export const PREVIEW_RUNTIME_CONTRACT_PATH = "apps/web/src/.beomz/runtime.json";
export const PREVIEW_BUILD_OUTPUT_DIRECTORY = "dist";

function buildGeneratedPageFilePath(templateId: TemplateId, pageId: string): string {
  return `apps/web/src/app/generated/${templateId}/${pageId}.tsx`;
}

export function createRuntimeContract(input: {
  mode: PreviewRuntimeContract["mode"];
  provider: PreviewProvider;
  project: Pick<Project, "id" | "name" | "templateId">;
  session?: PreviewSession;
}): PreviewRuntimeContract {
  const template = getTemplateDefinition(input.project.templateId);
  const previewSession =
    input.session
    ?? {
      id: `preview-${input.project.id}`,
      projectId: input.project.id,
      provider: input.provider,
      entryPath: template.previewEntryPath,
      status: "booting",
      createdAt: new Date().toISOString(),
    } satisfies PreviewSession;

  const bootstrap =
    input.mode === "preview"
      ? createPreviewBootstrap({
        project: input.project,
        session: previewSession,
        template,
      })
      : createPublishBootstrap({
        outputDirectory: PREVIEW_BUILD_OUTPUT_DIRECTORY,
        project: input.project,
        template,
      });

  const pageIdByRouteId = new Map<string, string>(
    template.pages.map((page) => [`${template.id}:${page.id}`, page.id] as const),
  );
  const pageIdByPath = new Map(template.pages.map((page) => [page.path, page.id] as const));

  return {
    mode: input.mode,
    provider: input.provider,
    project: input.project,
    templateId: template.id,
    shell: bootstrap.shell,
    entryPath: bootstrap.entryPath,
    navigation: bootstrap.navigation.map((item) => ({
      auth: item.auth,
      href: item.href,
      id: item.id,
      label: item.label,
    })),
    routes: bootstrap.routes.map((route) => {
      const pageId = pageIdByRouteId.get(route.id) ?? pageIdByPath.get(route.path);
      if (!pageId) {
        throw new Error(`No generated page mapping exists for route ${route.id}.`);
      }

      return {
        auth: route.auth,
        filePath: buildGeneratedPageFilePath(template.id, pageId),
        id: route.id,
        inPrimaryNav: route.inPrimaryNav,
        label: route.label,
        path: route.path,
        summary: route.summary,
      };
    }),
  };
}

export function serializeRuntimeContract(contract: PreviewRuntimeContract): string {
  return JSON.stringify(contract, null, 2);
}
