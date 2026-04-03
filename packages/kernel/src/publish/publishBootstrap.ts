import type { Project, TemplateDefinition, TemplateId, TemplateShell } from "@beomz-studio/contracts";
import { getTemplateDefinition } from "@beomz-studio/templates";
import { getPrimaryNavItems, type KernelNavItem } from "../nav/navRegistry.js";
import { getRoutesForTemplate, type KernelRouteDefinition } from "../routing/routeRegistry.js";

export const KERNEL_PROTECTED_PATHS = ["packages/kernel/**"] as const;

export interface PublishBootstrapInput {
  project: Pick<Project, "id" | "name" | "templateId">;
  template?: TemplateDefinition;
  domain?: string;
  outputDirectory?: string;
}

export interface PublishBootstrapPlan {
  templateId: TemplateId;
  shell: TemplateShell;
  domain?: string;
  outputDirectory: string;
  entryPath: string;
  routes: readonly KernelRouteDefinition[];
  navigation: readonly KernelNavItem[];
  protectedGlobs: readonly string[];
}

export function createPublishBootstrap(input: PublishBootstrapInput): PublishBootstrapPlan {
  const template = input.template ?? getTemplateDefinition(input.project.templateId);

  return {
    templateId: template.id,
    shell: template.shell,
    domain: input.domain,
    outputDirectory: input.outputDirectory ?? "dist/generated",
    entryPath: template.previewEntryPath,
    routes: getRoutesForTemplate(template.id),
    navigation: getPrimaryNavItems(template.id),
    protectedGlobs: KERNEL_PROTECTED_PATHS,
  };
}
