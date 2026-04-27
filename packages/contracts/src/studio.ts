import type { TemplateId } from "./templates.js";

export type ProjectStatus =
  | "draft"
  | "queued"
  | "building"
  | "ready"
  | "published"
  | "archived";

export type ProjectType = "app" | "website";

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
  | "cancelled"
  | "awaiting_scope_confirmation"
  | "insufficient_credits";

export type PlanPhase =
  | "idle"
  | "streaming_intro"
  | "awaiting_answers"
  | "streaming_summary"
  | "ready"
  | "approved";

export type AssetKind = "image" | "icon" | "document" | "video";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  templateId: TemplateId;
  projectType?: ProjectType;
  status: ProjectStatus;
  description?: string;
  icon?: string | null;
  previewEntryPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  // BEO-197: Phased build system
  phaseMode?: boolean;
  currentPhase?: number;
  phasesTotal?: number;
  buildPhases?: unknown | null;
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

export interface ClarifyOption {
  label: string;
  hint: string | null;
}

export interface ClarifyQuestion {
  id: string;
  text: string;
  options: readonly ClarifyOption[];
}

export interface ClarifyResponse {
  intro: string;
  questions: readonly ClarifyQuestion[];
}

export interface PlanStep {
  title: string;
  description: string;
}

export interface PlanResponse {
  summary: string;
  steps: readonly PlanStep[];
}

export interface PlanAnswer {
  questionId: string;
  answer: string;
}

export interface BuildPlanContext {
  planSessionId?: string;
  summary?: string;
  steps?: readonly PlanStep[];
}

export interface PlanSession {
  id: string;
  userId: string;
  prompt: string;
  phase: PlanPhase;
  questions: readonly ClarifyQuestion[];
  answers: Record<string, string>;
  summary: string | null;
  steps: readonly PlanStep[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanClarifyRequest {
  prompt: string;
}

export interface PlanGenerateRequest {
  prompt: string;
  answers: readonly PlanAnswer[];
}

export interface CreatePlanSessionRequest {
  prompt: string;
}

export interface CreatePlanSessionResponse {
  sessionId: string;
}

export interface UpdatePlanSessionRequest {
  phase?: PlanPhase;
  questions?: readonly ClarifyQuestion[];
  answers?: Record<string, string>;
  summary?: string | null;
  steps?: readonly PlanStep[];
}

export interface GetPlanSessionResponse {
  session: PlanSession;
}

export interface GetLatestActivePlanSessionResponse {
  session: PlanSession | null;
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
