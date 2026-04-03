import type { TemplateId, TemplateShell } from "@beomz-studio/contracts";
import { routeRegistry, type RouteAuthPolicy } from "../routing/routeRegistry.js";

export interface KernelNavItem {
  id: string;
  templateId: TemplateId;
  shell: TemplateShell;
  label: string;
  href: string;
  auth: RouteAuthPolicy;
}

export const navRegistry = Object.freeze(
  (Object.keys(routeRegistry) as TemplateId[]).reduce<Record<TemplateId, readonly KernelNavItem[]>>(
    (registry, templateId) => {
      registry[templateId] = routeRegistry[templateId]
        .filter((route) => route.inPrimaryNav)
        .map((route) => ({
          id: route.id,
          templateId: route.templateId,
          shell: route.shell,
          label: route.label,
          href: route.path,
          auth: route.auth,
        }));
      return registry;
    },
    {} as Record<TemplateId, readonly KernelNavItem[]>,
  ),
);

export function getPrimaryNavItems(templateId: TemplateId): readonly KernelNavItem[] {
  return navRegistry[templateId];
}
