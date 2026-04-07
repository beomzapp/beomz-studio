import type {
  BuildPlanContext,
  BuilderV3Event,
  BuilderV3TraceMetadata,
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
  operationId: string;
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
      changedPaths?: readonly string[];
      id: string;
      operationId: string;
      outputPaths: readonly string[];
      status: GenerationStatus;
      summary?: string;
    };
    previewEntryPath: string;
    warnings: readonly string[];
  } | null;
  trace: BuilderV3TraceMetadata;
}

export interface StartBuildResponse {
  build: BuildPayload;
  project: Project;
  result: null;
  template: TemplateDefinition;
  trace: BuilderV3TraceMetadata;
}

const DEFAULT_API_BASE_URL = "https://beomz-studioapi-production.up.railway.app";
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
  existingFiles?: readonly StudioFile[];
  prompt: string;
  projectId?: string;
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

export async function getLatestBuildForProject(
  projectId: string,
): Promise<BuildStatusResponse | null> {
  const response = await requestJson<BuildStatusResponse & { build: BuildPayload | null }>(
    `/projects/${projectId}/latest-build`,
    { method: "GET" },
  );
  return response.build ? (response as BuildStatusResponse) : null;
}

export async function getLatestBuildIdForProject(projectId: string): Promise<string | null> {
  const response = await getLatestBuildForProject(projectId);
  return response?.build?.id ?? null;
}

export async function streamBuildEvents(args: {
  buildId: string;
  lastEventId?: string | null;
  signal?: AbortSignal;
  onEvent?: (event: BuilderV3Event) => void;
}): Promise<void> {
  const accessToken = await getAccessToken();
  const query = args.lastEventId
    ? `?lastEventId=${encodeURIComponent(args.lastEventId)}`
    : "";
  const response = await fetch(`${getApiBaseUrl()}/builds/${args.buildId}/events${query}`, {
    headers: {
      accept: "text/event-stream",
      authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
    signal: args.signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(errorBody?.error ?? `Request failed with ${response.status}.`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Build events stream is unavailable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.join("\n");
    dataLines = [];

    try {
      const event = JSON.parse(payload) as BuilderV3Event;
      args.onEvent?.(event);
    } finally {
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      flushEvent();
      return;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const lineBreakIndex = buffer.indexOf("\n");
      if (lineBreakIndex === -1) {
        break;
      }

      const rawLine = buffer.slice(0, lineBreakIndex);
      buffer = buffer.slice(lineBreakIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

      if (line.length === 0) {
        flushEvent();
        continue;
      }

      if (line.startsWith("id:") || line.startsWith("event:")) {
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
        continue;
      }
    }
  }
}

export function createOrResumePreviewSession(
  body: CreatePreviewSessionRequest,
): Promise<CreatePreviewSessionResponse> {
  return requestJson<CreatePreviewSessionResponse>("/previews/session", {
    body: JSON.stringify(body),
    method: "POST",
  });
}
