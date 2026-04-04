import type { Project, StudioFile } from "./studio.js";
import type { TemplateId, TemplateShell } from "./templates.js";

export type PreviewProvider = "e2b" | "local";

export type PreviewSessionStatus = "booting" | "running" | "stopped" | "failed";

export type PreviewAuthPolicy = "public" | "authenticated";

export interface PreviewSession {
  id: string;
  projectId: string;
  provider: PreviewProvider;
  sandboxId?: string;
  url?: string;
  entryPath: string;
  status: PreviewSessionStatus;
  createdAt: string;
  expiresAt?: string;
}

export interface PreviewPatch {
  sessionId: string;
  files: readonly Pick<StudioFile, "path" | "content" | "kind">[];
  restartRequired: boolean;
  createdAt: string;
}

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

export interface CreatePreviewSessionRequest {
  projectId: string;
  generationId?: string;
}

export interface CreatePreviewSessionResponse {
  generationId: string;
  session: PreviewSession;
  runtime: PreviewRuntimeContract;
  fallbackHtml?: string;
  error?: string;
}

export interface PublishArtifact {
  outputDirectory: string;
  runtime: PreviewRuntimeContract;
  tarballPath: string;
  tarballUrl?: string;
}
