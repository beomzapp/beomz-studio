import type { TemplateId, TemplateShell } from "@beomz-studio/contracts";
import { TEMPLATE_REGISTRY } from "@beomz-studio/templates";

export type RouteAuthPolicy = "public" | "authenticated";

export interface KernelRouteDefinition {
  id: string;
  templateId: TemplateId;
  shell: TemplateShell;
  path: string;
  label: string;
  summary: string;
  auth: RouteAuthPolicy;
  inPrimaryNav: boolean;
}

export const routeRegistry = Object.freeze(
  TEMPLATE_REGISTRY.reduce<Record<TemplateId, readonly KernelRouteDefinition[]>>(
    (registry, template) => {
      registry[template.id] = template.pages.map((page) => ({
        id: `${template.id}:${page.id}`,
        templateId: template.id,
        shell: template.shell,
        path: page.path,
        label: page.navigationLabel,
        summary: page.summary,
        auth: page.requiresAuth ? "authenticated" : "public",
        inPrimaryNav: page.inPrimaryNav,
      }));
      return registry;
    },
    {} as Record<TemplateId, readonly KernelRouteDefinition[]>,
  ),
);

export function getRoutesForTemplate(templateId: TemplateId): readonly KernelRouteDefinition[] {
  return routeRegistry[templateId];
}
