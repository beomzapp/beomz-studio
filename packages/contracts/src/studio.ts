import type { TemplateId } from "./templates.js";

export type ProjectStatus =
  | "draft"
  | "queued"
  | "building"
  | "ready"
  | "published"
  | "archived";

export type StudioFileKind =
  | "route"
  | "component"
  | "layout"
  | "style"
  | "data"
  | "content"
  | "config"
  | "asset-manifest";

export type FileSource = "user" | "platform" | "ai";

export type GenerationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AssetKind = "image" | "icon" | "document" | "video";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  templateId: TemplateId;
  status: ProjectStatus;
  description?: string;
  previewEntryPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioFile {
  path: string;
  kind: StudioFileKind;
  language: string;
  content: string;
  source: FileSource;
  locked: boolean;
  hash?: string;
  updatedAt?: string;
}

export type File = StudioFile;

export interface Generation {
  id: string;
  projectId: string;
  templateId: TemplateId;
  operationId: string;
  status: GenerationStatus;
  prompt: string;
  startedAt: string;
  completedAt?: string;
  outputPaths: readonly string[];
  summary?: string;
  error?: string;
}

export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  provider: string;
  storageKey: string;
  mimeType: string;
  width?: number;
  height?: number;
  alt?: string;
  url?: string;
  createdAt: string;
}
