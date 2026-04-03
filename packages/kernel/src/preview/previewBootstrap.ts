import type {
  PreviewSession,
  Project,
  TemplateDefinition,
  TemplateId,
  TemplateShell,
} from "@beomz-studio/contracts";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { getPrimaryNavItems, type KernelNavItem } from "../nav/navRegistry.js";
import { getRoutesForTemplate, type KernelRouteDefinition } from "../routing/routeRegistry.js";

export interface PreviewBootstrapInput {
  project: Pick<Project, "id" | "name" | "templateId">;
  session: PreviewSession;
  template?: TemplateDefinition;
}

export interface PreviewBootstrapPlan {
  provider: PreviewSession["provider"];
  templateId: TemplateId;
  shell: TemplateShell;
  entryPath: string;
  routes: readonly KernelRouteDefinition[];
  navigation: readonly KernelNavItem[];
  session: PreviewSession;
}

export function createPreviewBootstrap(input: PreviewBootstrapInput): PreviewBootstrapPlan {
  const template = input.template ?? getTemplateDefinition(input.project.templateId);

  return {
    provider: input.session.provider,
    templateId: template.id,
    shell: template.shell,
    entryPath: template.previewEntryPath,
    routes: getRoutesForTemplate(template.id),
    navigation: getPrimaryNavItems(template.id),
    session: input.session,
  };
}
