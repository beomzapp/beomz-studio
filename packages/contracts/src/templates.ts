export type TemplateId =
  | "marketing-website"
  | "saas-dashboard"
  | "workspace-task"
  | "mobile-app"
  | "social-app"
  | "ecommerce"
  | "portfolio"
  | "blog-cms"
  | "onboarding-flow"
  | "data-table-app"
  | "interactive-tool";

export type TemplateShell = "website" | "dashboard" | "workspace";

export type TemplatePageKind =
  | "landing"
  | "pricing"
  | "contact"
  | "dashboard-home"
  | "customers"
  | "settings"
  | "tasks"
  | "board"
  | "mobile-home"
  | "activity"
  | "profile"
  | "feed"
  | "explore"
  | "products"
  | "checkout"
  | "projects"
  | "articles"
  | "article"
  | "onboarding-step"
  | "data-table"
  | "tool";

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

// ── Pre-built template types ────────────────────────────────────────

export interface TemplateFile {
  path: string;
  content: string;
}

export interface TemplateManifest {
  id: string;
  name: string;
  description: string;
  shell: TemplateShell;
  accentColor: string;
  tags: readonly string[];
}

export interface PrebuiltTemplate {
  manifest: TemplateManifest;
  files: readonly TemplateFile[];
}
