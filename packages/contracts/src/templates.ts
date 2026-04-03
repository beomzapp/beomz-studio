export type TemplateId =
  | "marketing-website"
  | "saas-dashboard"
  | "workspace-task";

export type TemplateShell = "website" | "dashboard" | "workspace";

export type TemplatePageKind =
  | "landing"
  | "pricing"
  | "contact"
  | "dashboard-home"
  | "customers"
  | "settings"
  | "tasks"
  | "board";

export interface TemplatePage {
  id: string;
  name: string;
  path: string;
  kind: TemplatePageKind;
  summary: string;
  navigationLabel: string;
  inPrimaryNav: boolean;
  requiresAuth: boolean;
}

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  shell: TemplateShell;
  defaultProjectName: string;
  previewEntryPath: string;
  promptHints: readonly string[];
  pages: readonly TemplatePage[];
}
