import type {
  CreatePreviewSessionRequest,
  CreatePreviewSessionResponse,
  GenerationStatus,
  Project,
  StudioFile,
  TemplateDefinition,
} from "@beomz-studio/contracts";

import { supabase } from "./supabase";

export interface BuildPayload {
  completedAt: string | null;
  error: string | null;
  id: string;
  phase: string | null;
  projectId: string;
  source: string | null;
  startedAt: string;
  status: GenerationStatus;
  summary: string | null;
  templateId: string;
  templateReason?: string | null;
  workflowId?: string | null;
}

export interface BuildStatusResponse {
  build: BuildPayload;
  project: Project;
  result: {
    files: readonly StudioFile[];
    generation: {
      id: string;
      operationId: string;
      outputPaths: readonly string[];
      status: GenerationStatus;
      summary?: string;
    };
    previewEntryPath: string;
    warnings: readonly string[];
  } | null;
}

export interface StartBuildResponse {
  build: BuildPayload;
  project: Project;
  result: null;
  template: TemplateDefinition;
}

const DEFAULT_API_BASE_URL = "http://localhost:3001";

export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("A valid platform session is required.");
  }

  return session.access_token;
}

async function requestJson<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as
      | { error?: string; details?: unknown }
      | null;
    throw new Error(errorBody?.error ?? `Request failed with ${response.status}.`);
  }

  return response.json() as Promise<TResponse>;
}

export function startBuild(body: {
  prompt: string;
  projectName?: string;
}): Promise<StartBuildResponse> {
  return requestJson<StartBuildResponse>("/builds/start", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

export function getBuildStatus(buildId: string): Promise<BuildStatusResponse> {
  return requestJson<BuildStatusResponse>(`/builds/${buildId}/status`, {
    method: "GET",
  });
}

export function createOrResumePreviewSession(
  body: CreatePreviewSessionRequest,
): Promise<CreatePreviewSessionResponse> {
  return requestJson<CreatePreviewSessionResponse>("/previews/session", {
    body: JSON.stringify(body),
    method: "POST",
  });
}
