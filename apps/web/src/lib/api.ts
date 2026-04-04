import type {
  BuildPlanContext,
  CreatePlanSessionRequest,
  CreatePlanSessionResponse,
  CreatePreviewSessionRequest,
  CreatePreviewSessionResponse,
  GetLatestActivePlanSessionResponse,
  GetPlanSessionResponse,
  GenerationStatus,
  Project,
  StudioFile,
  TemplateDefinition,
  UpdatePlanSessionRequest,
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
let accessTokenPromise: Promise<string> | null = null;

export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export async function getAccessToken(): Promise<string> {
  if (!accessTokenPromise) {
    accessTokenPromise = supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session?.access_token) {
          throw new Error("A valid platform session is required.");
        }

        return session.access_token;
      })
      .finally(() => {
        accessTokenPromise = null;
      });
  }

  return accessTokenPromise;
}

async function requestJson<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const accessToken = await getAccessToken();
  const url = `${getApiBaseUrl()}${path}`;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    ...(init.headers ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    // Network error, CORS block, DNS failure — do NOT retry
    throw new Error("Generation failed — please try again");
  }

  // Retry once on transient 5xx
  if (response.status >= 500 && response.status < 600) {
    try {
      response = await fetch(url, { ...init, headers });
    } catch {
      throw new Error("Generation failed — please try again");
    }
  }

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
} & BuildPlanContext): Promise<StartBuildResponse> {
  return requestJson<StartBuildResponse>("/builds/start", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

export function createPlanSession(
  body: CreatePlanSessionRequest,
): Promise<CreatePlanSessionResponse> {
  return requestJson<CreatePlanSessionResponse>("/plan/session", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

export function updatePlanSession(
  sessionId: string,
  body: UpdatePlanSessionRequest,
): Promise<GetPlanSessionResponse> {
  return requestJson<GetPlanSessionResponse>(`/plan/session/${sessionId}`, {
    body: JSON.stringify(body),
    method: "PATCH",
  });
}

export function getPlanSession(sessionId: string): Promise<GetPlanSessionResponse> {
  return requestJson<GetPlanSessionResponse>(`/plan/session/${sessionId}`, {
    method: "GET",
  });
}

export function getLatestActivePlanSession(): Promise<GetLatestActivePlanSessionResponse> {
  return requestJson<GetLatestActivePlanSessionResponse>("/plan/session/latest/active", {
    method: "GET",
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
