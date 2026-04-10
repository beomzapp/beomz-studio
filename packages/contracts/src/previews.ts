import type { Project } from "./studio.js";
import type { TemplateId, TemplateShell } from "./templates.js";

export type PreviewProvider = "webcontainer" | "local";

export type PreviewAuthPolicy = "public" | "authenticated";

export interface PreviewNavigationItem {
  id: string;
  href: string;
  label: string;
  auth: PreviewAuthPolicy;
}

export interface PreviewRuntimeRoute {
  id: string;
  path: string;
  label: string;
  summary: string;
  auth: PreviewAuthPolicy;
  inPrimaryNav: boolean;
  filePath: string;
}

export interface PreviewRuntimeContract {
  mode: "preview" | "publish";
  provider: PreviewProvider;
  project: Pick<Project, "id" | "name" | "templateId">;
  templateId: TemplateId;
  shell: TemplateShell;
  entryPath: string;
  navigation: readonly PreviewNavigationItem[];
  routes: readonly PreviewRuntimeRoute[];
}

export interface PublishArtifact {
  outputDirectory: string;
  runtime: PreviewRuntimeContract;
  tarballPath: string;
  tarballUrl?: string;
}
