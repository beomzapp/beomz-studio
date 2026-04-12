import type {
  BuildPlanContext,
  BuilderV3Event,
  BuilderV3TraceMetadata,
  CreatePlanSessionRequest,
  CreatePlanSessionResponse,
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

function normalizeRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isAbortSignalLike(value: unknown): value is AbortSignal {
  return typeof value === "object"
    && value !== null
    && "aborted" in value
    && typeof value.aborted === "boolean"
    && "addEventListener" in value
    && typeof value.addEventListener === "function"
    && "removeEventListener" in value
    && typeof value.removeEventListener === "function";
}

function toLoggedError(error: unknown): { message: string; name: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: typeof error,
  };
}

export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export async function getAccessToken(): Promise<string> {
  if (!accessTokenPromise) {
    accessTokenPromise = supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session?.access_token) {
          console.error("[getAccessToken] No access token. Session object:", JSON.stringify(session, null, 2));
          throw new Error("A valid platform session is required.");
        }

        return session.access_token;
      })
      .catch((error) => {
        console.error("[getAccessToken] Failed:", error?.message ?? error, "| Full error:", error);
        throw error;
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
  model?: string;
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

export interface CreditsResponse {
  balance: number;
  monthly: number;
  topup: number;
  plan: string;
  planCredits: number;
}

export async function getCredits(): Promise<CreditsResponse> {
  return requestJson<CreditsResponse>("/credits", { method: "GET" });
}

export interface ProjectsListResponse {
  projects: Array<Project & { generationCount: number }>;
  plan: string;
  maxProjects: number;
  canCreateMore: boolean;
  planCredits: number;
}

export async function listProjects(): Promise<Array<Project & { generationCount: number }>> {
  const data = await requestJson<ProjectsListResponse>("/projects", { method: "GET" });
  return data.projects;
}

export async function listProjectsWithMeta(): Promise<ProjectsListResponse> {
  return requestJson<ProjectsListResponse>("/projects", { method: "GET" });
}

export async function enhancePrompt(prompt: string): Promise<string> {
  const url = `${getApiBaseUrl()}/enhance`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Enhance failed with ${res.status}.`);
  }
  const data = await res.json() as { enhancedPrompt: string };
  return data.enhancedPrompt;
}

// ── Database API ────────────────────────────────────────────

export interface DbColumn {
  name: string;
  type: string;
}

export interface DbTable {
  name: string;
  columns: DbColumn[];
}

export interface DbSchemaResponse {
  tables: DbTable[];
}

export interface DbRowsResponse {
  rows: Record<string, unknown>[];
}

export interface ProjectDbState {
  database_enabled: boolean;
  db_provider: string | null;
  db_wired: boolean;
  supabaseUrl?: string;
  anonKey?: string;
  schemaName?: string;
}

export async function getProjectDbState(projectId: string): Promise<ProjectDbState> {
  const status = await requestJson<{
    enabled: boolean;
    provider: string | null;
    wired: boolean;
    env?: { url: string; anonKey: string; dbSchema: string } | null;
  }>(`/projects/${projectId}/db/status`, { method: "GET" });
  return {
    database_enabled: Boolean(status.enabled),
    db_provider: status.provider ?? null,
    db_wired: Boolean(status.wired),
    supabaseUrl: status.env?.url,
    anonKey: status.env?.anonKey,
    schemaName: status.env?.dbSchema,
  };
}

export async function enableDatabase(projectId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/projects/${projectId}/db/enable`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface WireDatabaseResponse {
  wired: boolean;
  migrationsApplied: number;
  files: Array<{ path: string; content: string }>;
  migrationErrors?: string[];
  dbCredentials?: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    schemaName: string;
  };
}

export async function wireDatabase(projectId: string): Promise<WireDatabaseResponse> {
  return requestJson<WireDatabaseResponse>(`/projects/${projectId}/db/wire`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function connectDatabase(
  projectId: string,
  body: { url: string; anonKey: string },
): Promise<void> {
  await requestJson<{ ok: boolean }>(`/projects/${projectId}/db/connect`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getDbSchema(projectId: string): Promise<DbSchemaResponse> {
  return requestJson<DbSchemaResponse>(`/projects/${projectId}/db/schema`, {
    method: "GET",
  });
}

export async function getDbRows(
  projectId: string,
  table: string,
): Promise<DbRowsResponse> {
  return requestJson<DbRowsResponse>(
    `/projects/${projectId}/db/rows?table=${encodeURIComponent(table)}`,
    { method: "GET" },
  );
}

export async function runDbMigration(
  projectId: string,
  sql: string,
): Promise<void> {
  await requestJson<{ ok: boolean }>(`/projects/${projectId}/db/migrate`, {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
}

export async function fixFile(args: {
  buildId: string;
  filePath: string;
  errorMessage: string;
  fileContent: string;
}): Promise<string> {
  const url = `${getApiBaseUrl()}/fix`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Fix failed with ${res.status}.`);
  }
  const data = await res.json() as { fixedContent: string };
  return data.fixedContent;
}

export async function streamBuildEvents(args: {
  buildId: string;
  lastEventId?: string | null;
  signal?: AbortSignal;
  onEvent?: (event: BuilderV3Event) => void;
}): Promise<void> {
  const buildId = normalizeRequiredString(args.buildId, "buildId");
  const lastEventId = normalizeOptionalString(args.lastEventId);
  const accessToken = normalizeRequiredString(await getAccessToken(), "access token");
  const signal = isAbortSignalLike(args.signal) ? args.signal : undefined;
  const apiBaseUrl = `${getApiBaseUrl()}/`;
  const sseUrl = new URL(
    `builds/${encodeURIComponent(buildId)}/events`,
    apiBaseUrl,
  );

  if (lastEventId) {
    sseUrl.searchParams.set("lastEventId", lastEventId);
  }

  const headers = new Headers({
    accept: "text/event-stream",
    authorization: `Bearer ${accessToken}`,
  });
  const loggedHeaders = Object.fromEntries(headers.entries());

  console.log("[SSE] Prepared fetch args:", {
    buildId,
    headers: loggedHeaders,
    lastEventId,
    rawLastEventId: args.lastEventId,
    rawLastEventIdType: args.lastEventId === null ? "null" : typeof args.lastEventId,
    signalAborted: signal?.aborted ?? false,
    signalConstructor: signal?.constructor?.name ?? "none",
    url: sseUrl.toString(),
  });

  const fetchAbortController = new AbortController();
  const forwardAbort = () => {
    fetchAbortController.abort(signal?.reason);
  };

  if (signal?.aborted) {
    forwardAbort();
  } else if (signal) {
    signal.addEventListener("abort", forwardAbort, { once: true });
  }

  const fetchInitBase: RequestInit = {
    headers,
    method: "GET",
  };

  let response: Response;
  let usingSignalFallback = false;
  try {
    console.log("[SSE] Attempting fetch:", sseUrl.toString(), "| signal.aborted:", fetchAbortController.signal.aborted);
    response = await fetch(sseUrl, {
      ...fetchInitBase,
      signal: fetchAbortController.signal,
    });
  } catch (error) {
    const loggedError = toLoggedError(error);
    console.error("[SSE] Primary fetch failed before response:", loggedError);

    if (signal?.aborted || loggedError.name === "AbortError") {
      throw error;
    }

    try {
      response = await fetch(sseUrl, fetchInitBase);
      usingSignalFallback = true;
      console.warn("[SSE] Retry without signal reached the network:", {
        ok: response.ok,
        status: response.status,
      });
    } catch (retryError) {
      const loggedRetryError = toLoggedError(retryError);
      console.error("[SSE] Retry without signal also failed:", loggedRetryError);

      try {
        const probeResponse = await fetch(sseUrl, { method: "GET" });
        console.warn("[SSE] Minimal probe fetch result:", {
          ok: probeResponse.ok,
          status: probeResponse.status,
        });
        if (probeResponse.body) {
          await probeResponse.body.cancel().catch(() => undefined);
        }
      } catch (probeError) {
        console.error("[SSE] Minimal probe fetch failed:", toLoggedError(probeError));
      }

      throw new Error(`${loggedError.name}: ${loggedError.message}`);
    }
  } finally {
    if (signal) {
      signal.removeEventListener("abort", forwardAbort);
    }
  }

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
  let removeReaderAbortListener = () => undefined;

  if (usingSignalFallback && signal) {
    const cancelReaderOnAbort = () => {
      void reader.cancel(signal.reason).catch(() => undefined);
    };

    if (signal.aborted) {
      cancelReaderOnAbort();
    } else {
      signal.addEventListener("abort", cancelReaderOnAbort, { once: true });
      removeReaderAbortListener = () => {
        signal.removeEventListener("abort", cancelReaderOnAbort);
      };
    }
  }

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

  try {
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
  } finally {
    removeReaderAbortListener();
  }
}
