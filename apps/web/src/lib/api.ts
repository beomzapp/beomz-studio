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
  /** BEO-370: chat history written by the backend for session restore on hard refresh. */
  sessionEvents?: readonly Record<string, unknown>[];
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
let signOutPromise: Promise<void> | null = null;

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

export class StreamHttpError extends Error {
  status: number;
  body: Record<string, unknown> | null;
  constructor(status: number, body: Record<string, unknown> | null) {
    super(body?.error ? String(body.error) : `Request failed with ${status}.`);
    this.name = "StreamHttpError";
    this.status = status;
    this.body = body;
  }
}

/** BEO-348: Thrown when the API is unreachable (e.g. PM2 reload during deploy).
 *  Distinct from real build failures so the UI can show a friendly amber
 *  "Connection lost" card instead of a red error. */
export class NetworkDisconnectError extends Error {
  constructor(message = "Connection lost") {
    super(message);
    this.name = "NetworkDisconnectError";
  }
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
        if (session?.access_token) {
          return session.access_token;
        }
        console.error("[getAccessToken] No access token. Session object:", JSON.stringify(session, null, 2));
        throw new Error("A valid platform session is required.");
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

export async function signOutAndRedirectToLogin(): Promise<void> {
  if (!signOutPromise) {
    signOutPromise = (async () => {
      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error("[auth] Failed to sign out after 401:", error);
      }

      if (typeof window !== "undefined" && window.location.pathname !== "/auth/login") {
        window.location.assign("/auth/login");
      }
    })().finally(() => {
      signOutPromise = null;
    });
  }

  return signOutPromise;
}

export async function handleUnauthorizedResponse(response: Pick<Response, "status">): Promise<void> {
  if (response.status === 401) {
    await signOutAndRedirectToLogin();
  }
}

async function requestJson<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const accessToken = await getAccessToken();
  const urlObj = new URL(`${getApiBaseUrl()}${path}`);

  // BEO-610: forward stored referral code so loadOrgContext credits the
  // referrer on first sign-in. The code is cleared after the first
  // successful authenticated request so it doesn't linger forever.
  const storedRef = typeof localStorage !== "undefined"
    ? localStorage.getItem("referral_code")
    : null;
  if (storedRef) {
    urlObj.searchParams.set("ref", storedRef);
  }

  const url = urlObj.toString();
  const method = (init.method ?? "GET").toUpperCase();
  const headers = {
    authorization: `Bearer ${accessToken}`,
    ...(method !== "GET" ? { "content-type": "application/json" } : {}),
    ...(init.headers ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    // Network error, CORS block, DNS failure — do NOT retry.
    // BEO-348: surface as NetworkDisconnectError so callers can show the
    // friendly amber "Connection lost" state instead of a red build error.
    throw new NetworkDisconnectError();
  }

  // Retry once on transient 5xx
  if (response.status >= 500 && response.status < 600) {
    try {
      response = await fetch(url, { ...init, headers });
    } catch {
      throw new NetworkDisconnectError();
    }
  }

  if (!response.ok) {
    await handleUnauthorizedResponse(response);
    const errorBody = await response.json().catch(() => null) as
      | { error?: string; details?: unknown }
      | null;
    throw new Error(errorBody?.error ?? `Request failed with ${response.status}.`);
  }

  if (storedRef && typeof localStorage !== "undefined") {
    localStorage.removeItem("referral_code");
  }

  return response.json() as Promise<TResponse>;
}

export function startBuild(body: {
  existingFiles?: readonly StudioFile[];
  implementPlan?: string;
  model?: string;
  prompt: string;
  projectId?: string;
  projectName?: string;
  imageUrl?: string;
  /** BEO-704: DB/Auth setup card flags — passed by user choice before first build */
  withDatabase?: boolean;
  withAuth?: boolean;
} & BuildPlanContext): Promise<StartBuildResponse> {
  return requestJson<StartBuildResponse>("/builds/start", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

export async function uploadImage(
  file: File,
  projectId: string,
): Promise<{ imageUrl: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";
  const form = new FormData();
  form.append("image", file);
  form.append("projectId", projectId);
  const resp = await fetch(`${getApiBaseUrl()}/builds/upload-image`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!resp.ok) {
    await handleUnauthorizedResponse(resp);
    const text = await resp.text().catch(() => "Upload failed");
    throw new Error(text || `Upload failed with ${resp.status}`);
  }
  return resp.json() as Promise<{ imageUrl: string }>;
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
  // BEO-346 / BEO-322: optional three-bucket breakdown. Backend may not
  // populate these yet — consumers should fall back to `balance` when absent.
  rollover?: number;
  used?: number;
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

export async function getProject(projectId: string): Promise<Project> {
  return requestJson<Project>(`/projects/${projectId}`, { method: "GET" });
}

export async function deleteProject(projectId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/projects/${projectId}`, { method: "DELETE" });
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
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
  /** Normalized from table_name for backward compat */
  name: string;
  table_name: string;
  columns: DbColumn[];
}

export interface DbSchemaResponse {
  tables: DbTable[];
}

export interface DbUsageResponse {
  used_mb: number;
  limits: {
    storage_mb: number;
  };
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
  /** BEO-428: Neon connection string — injected as VITE_DATABASE_URL into WC .env.local */
  neonDbUrl?: string | null;
  /** BEO-445: BYO Postgres host (sanitised — no password) returned by status endpoint */
  byoDbHost?: string | null;
}

export async function getProjectDbState(projectId: string): Promise<ProjectDbState> {
  const status = await requestJson<{
    enabled: boolean;
    provider: string | null;
    wired: boolean;
    env?: { url: string; anonKey: string; dbSchema: string } | null;
    /** BEO-428: Neon connection string returned by status endpoint */
    dbUrl?: string | null;
    /** BEO-445: BYO host returned when provider === 'byo' */
    byoDbHost?: string | null;
  }>(`/projects/${projectId}/db/status`, { method: "GET" });
  return {
    database_enabled: Boolean(status.enabled),
    db_provider: status.provider ?? null,
    db_wired: Boolean(status.wired),
    supabaseUrl: status.env?.url,
    anonKey: status.env?.anonKey,
    schemaName: status.env?.dbSchema,
    neonDbUrl: status.dbUrl ?? null,
    byoDbHost: status.byoDbHost ?? null,
  };
}

/** BEO-445: Test a BYO Postgres connection string without saving. */
export async function testByoDb(
  projectId: string,
  connectionString: string,
): Promise<{ ok: boolean; error?: string }> {
  return requestJson<{ ok: boolean; error?: string }>(`/projects/${projectId}/byo-db`, {
    method: "POST",
    body: JSON.stringify({ connectionString, test: true }),
  });
}

/** BEO-445: Save and activate a BYO Postgres connection string. */
export async function saveByoDb(
  projectId: string,
  connectionString: string,
): Promise<void> {
  await requestJson<{ ok: boolean }>(`/projects/${projectId}/byo-db`, {
    method: "POST",
    body: JSON.stringify({ connectionString }),
  });
}

/** BEO-445: Remove the BYO Postgres connection from a project. */
export async function disconnectByoDb(projectId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/projects/${projectId}/byo-db`, {
    method: "DELETE",
  });
}

/** BEO-522: Connect a user's own Supabase project (URL + anon key).
 *  BEO-524: Returns { wiring: true } when an auto-wire iteration was triggered.
 *  BEO-532: May return setupSql — CREATE TABLE statements the user must run
 *           in their Supabase SQL editor (service role key is not available). */
export async function connectSupabaseDb(
  projectId: string,
  url: string,
  anonKey: string,
): Promise<{ wiring: boolean; host?: string; setupSql?: string }> {
  return requestJson<{ wiring: boolean; host?: string; setupSql?: string }>(
    `/projects/${projectId}/byo-db`,
    {
      method: "POST",
      body: JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey }),
    },
  );
}

export type SupabaseOAuthProject = {
  ref: string;
  name: string;
  region: string;
};

export async function getSupabaseOAuthProjects(projectId: string): Promise<SupabaseOAuthProject[]> {
  const data = await requestJson<{ projects: SupabaseOAuthProject[] }>(
    `/integrations/supabase/projects?projectId=${encodeURIComponent(projectId)}`,
    { method: "GET" },
  );
  return data.projects ?? [];
}

export async function connectSupabaseOAuth(
  projectId: string,
  supabaseProjectRef: string,
): Promise<{ wiring: boolean; host?: string; setupSql?: string }> {
  return requestJson<{ wiring: boolean; host?: string; setupSql?: string }>(
    `/integrations/supabase/connect`,
    {
      method: "POST",
      body: JSON.stringify({ projectId, supabaseProjectRef }),
    },
  );
}

export type SupabaseOrganization = {
  id: string;
  name: string;
};

export async function getSupabaseOrganizations(
  projectId: string,
): Promise<SupabaseOrganization[]> {
  const data = await requestJson<{ organizations: SupabaseOrganization[] }>(
    `/integrations/supabase/organizations?projectId=${encodeURIComponent(projectId)}`,
    { method: "GET" },
  );
  return data.organizations ?? [];
}

export async function createSupabaseProject(
  projectId: string,
  name: string,
  region: string,
  organizationId: string,
): Promise<{ ref: string }> {
  return requestJson<{ ref: string }>(`/integrations/supabase/create-project`, {
    method: "POST",
    body: JSON.stringify({ projectId, name, region, organizationId }),
  });
}

export async function getSupabaseProjectStatus(
  projectId: string,
  ref: string,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/integrations/supabase/project-status?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent(ref)}`,
    { method: "GET" },
  );
}

/** BEO-522: Disconnect a BYO Supabase project (and clear all db_ columns). */
export async function disconnectSupabaseDb(projectId: string): Promise<void> {
  await requestJson<{ status: string }>(`/projects/${projectId}/db/disable`, {
    method: "POST",
  });
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
  await requestJson<{ host?: string }>(`/projects/${projectId}/byo-db`, {
    method: "POST",
    body: JSON.stringify({
      supabaseUrl: body.url,
      supabaseAnonKey: body.anonKey,
    }),
  });
}

export async function getDbSchema(projectId: string): Promise<DbSchemaResponse> {
  const raw = await requestJson<{
    tables: Array<{
      name?: string;
      table_name?: string;
      columns?: DbColumn[];
    }>;
  }>(`/projects/${projectId}/db/schema`, { method: "GET" });
  return {
    tables: (raw.tables ?? []).map((t) => {
      const resolvedName = t.table_name ?? t.name ?? "";
      return {
        name: resolvedName,
        table_name: resolvedName,
        columns: t.columns ?? [],
      };
    }),
  };
}

export async function getDbRows(
  projectId: string,
  table: string,
): Promise<DbRowsResponse> {
  return requestJson<DbRowsResponse>(
    `/projects/${projectId}/db/data?table=${encodeURIComponent(table)}`,
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

export async function getDbUsage(projectId: string): Promise<DbUsageResponse> {
  return requestJson<DbUsageResponse>(`/projects/${projectId}/db/usage`, {
    method: "GET",
  });
}

export interface StorageAddonInfo {
  label: string;
  price_usd: number;
  extra_storage_mb: number;
  price_id: string | undefined;
}

export async function getStorageAddons(): Promise<StorageAddonInfo[]> {
  return requestJson<StorageAddonInfo[]>("/payments/storage-addons", {
    method: "GET",
  });
}

export async function createStorageAddonCheckout(
  priceId: string,
  projectId: string,
): Promise<{ url: string }> {
  return requestJson<{ url: string }>("/payments/storage-addon/checkout", {
    method: "POST",
    body: JSON.stringify({ priceId, projectId }),
  });
}

// ── Publish API ─────────────────────────────────��──────────────

export async function publishProject(
  projectId: string,
  slug: string,
): Promise<{ ok: boolean; url: string }> {
  return requestJson<{ ok: boolean; url: string }>(`/projects/${projectId}/publish`, {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
}

export async function unpublishProject(projectId: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/projects/${projectId}/publish`, {
    method: "DELETE",
  });
}

export async function checkSlugAvailable(slug: string): Promise<{ available: boolean }> {
  return requestJson<{ available: boolean }>(
    `/projects/check-slug?slug=${encodeURIComponent(slug)}`,
    { method: "GET" },
  );
}

export interface PublicProjectResponse {
  projectId: string;
  projectName: string;
  files: Array<{ path: string; content: string }>;
  templateId?: string;
  dbCredentials?: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    schemaName: string;
    nonce?: string;
  } | null;
}

export async function getPublicProject(slug: string): Promise<PublicProjectResponse> {
  const url = `${getApiBaseUrl()}/p/${encodeURIComponent(slug)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(errorBody?.error ?? `Request failed with ${response.status}.`);
  }
  return response.json() as Promise<PublicProjectResponse>;
}

export async function exportProjectZip(projectId: string): Promise<Blob> {
  const accessToken = await getAccessToken();
  const url = `${getApiBaseUrl()}/projects/${projectId}/export`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    await handleUnauthorizedResponse(response);
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(errorBody?.error ?? `Export failed with ${response.status}.`);
  }
  return response.blob();
}

export async function deployToVercel(
  projectId: string,
): Promise<{ ok: boolean; deploymentId: string; status: string }> {
  return requestJson<{ ok: boolean; deploymentId: string; status: string }>(
    `/projects/${projectId}/deploy/vercel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function getVercelDeployStatus(
  projectId: string,
): Promise<{ status: "deploying" | "ready" | "error"; url?: string }> {
  return requestJson<{ status: "deploying" | "ready" | "error"; url?: string }>(
    `/projects/${projectId}/deploy/vercel/status`,
    { method: "GET" },
  );
}

export async function unpublishVercel(
  projectId: string,
): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(
    `/projects/${projectId}/deploy/vercel`,
    { method: "DELETE" },
  );
}

// ── Custom Domains API (BEO-556) ──────────────────────────────

export interface CustomDomainVerification {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface CustomDomain {
  domain: string;
  status: "pending" | "verified" | "error";
  /** Set when API returns a boolean (mirrors Vercel); prefer `status` in UI. */
  verified?: boolean;
  verification?: CustomDomainVerification[];
  /** DNS registrar label from WHOIS/RDAP (BEO-566). */
  registrar?: string | null;
  /** Link to registrar DNS docs or management (BEO-566). */
  docsUrl?: string | null;
}

/** API may return `verified` without `status`, or host under `name` / `hostname`. */
function normalizeCustomDomain(raw: unknown): CustomDomain {
  const r = raw as {
    domain?: string;
    name?: string;
    hostname?: string;
    status?: string;
    verified?: boolean;
    verification?: CustomDomainVerification[];
    registrar?: string | null;
    docsUrl?: string | null;
  };
  const host =
    (typeof r.domain === "string" && r.domain) ||
    (typeof r.name === "string" && r.name) ||
    (typeof r.hostname === "string" && r.hostname) ||
    "";
  let status: CustomDomain["status"] = "pending";
  if (r.status === "verified" || r.status === "pending" || r.status === "error") {
    status = r.status;
  } else if (r.verified === true) {
    status = "verified";
  } else if (r.verified === false) {
    status = "pending";
  }
  return {
    domain: host,
    status,
    /** Aligned with `status` so UI can use `!domain.verified` per API shape. */
    verified: status === "verified",
    verification: Array.isArray(r.verification) ? r.verification : undefined,
    registrar: r.registrar,
    docsUrl: r.docsUrl,
  };
}

export async function listCustomDomains(projectId: string): Promise<CustomDomain[]> {
  // The API returns a plain array (not wrapped in { domains: [...] })
  const data = await requestJson<unknown>(
    `/projects/${projectId}/domains`,
    { method: "GET" },
  );
  const rawList = Array.isArray(data) ? data : [];
  return rawList.map(normalizeCustomDomain);
}

export async function addCustomDomain(
  projectId: string,
  domain: string,
): Promise<CustomDomain> {
  const raw = await requestJson<unknown>(`/projects/${projectId}/domains`, {
    method: "POST",
    body: JSON.stringify({ domain }),
  });
  return normalizeCustomDomain(raw);
}

export async function verifyCustomDomain(
  projectId: string,
  domain: string,
): Promise<CustomDomain> {
  const raw = await requestJson<unknown>(
    `/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return normalizeCustomDomain(raw);
}

export async function removeCustomDomain(
  projectId: string,
  domain: string,
): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" },
  );
}

/**
 * BEO-576: Remove the active custom domain from Vercel and clear the DB
 * domain_status field. Calling this reverts the project to "no active domain".
 */
export async function deleteActiveDomain(projectId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/projects/${projectId}/domain`,
    { method: "DELETE" },
  );
}

/**
 * BEO-563: Lightweight client-side check to determine if a custom domain is
 * reachable. Returns true only when the domain resolves and serves a 200-level
 * response. A network failure (DNS not yet propagated, timeout, CORS) returns
 * false — this is the safe/expected default for newly-added domains.
 */
export async function checkDomainReachable(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Fix API ────────────────────────────────────────────────────

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

export async function startNextPhase(projectId: string): Promise<Response> {
  const accessToken = await getAccessToken();
  const url = `${getApiBaseUrl()}/projects/${encodeURIComponent(projectId)}/next-phase`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
  if (!response.ok) {
    await handleUnauthorizedResponse(response);
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(errorBody?.error ?? `Next phase failed with ${response.status}.`);
  }
  return response;
}

export async function confirmScope(
  buildId: string,
  features: string[],
  extras: string,
): Promise<void> {
  await requestJson<{ ok: boolean }>(`/builds/${buildId}/confirm-scope`, {
    method: "POST",
    body: JSON.stringify({ features, extras }),
  });
}

export async function createCheckoutSession(
  plan: string,
  interval: "monthly" | "yearly",
): Promise<{ url: string }> {
  return requestJson<{ url: string }>("/payments/checkout", {
    method: "POST",
    body: JSON.stringify({ type: "subscription", plan, interval }),
  });
}

// BEO-360: Top-up credit pack checkout — POST /payments/topup/checkout
export async function createTopupCheckout(
  priceId: string,
): Promise<{ url: string }> {
  return requestJson<{ url: string }>("/payments/topup/checkout", {
    method: "POST",
    body: JSON.stringify({ priceId }),
  });
}

// ── User Profile API (BEO-276) ────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  /** Google OAuth display name — returned by GET /api/me, used to pre-fill onboarding form */
  name?: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  building_for: string | null;
  referral_source: string | null;
  onboarding_completed: boolean | null;
  created_at: string;
  plan: string;
  credits: number;
  workspace_knowledge?: string | null;
}

export async function getMe(): Promise<UserProfile> {
  return requestJson<UserProfile>("/me", { method: "GET" });
}

export async function patchMe(body: {
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
  building_for?: string;
  referral_source?: string;
  workspace_knowledge?: string;
}): Promise<UserProfile> {
  return requestJson<UserProfile>("/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function completeOnboarding(): Promise<void> {
  await requestJson<{ success: boolean }>("/me/complete-onboarding", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function uploadUserAvatar(file: File): Promise<{ avatar_url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";
  const form = new FormData();
  form.append("avatar", file);
  const resp = await fetch(`${getApiBaseUrl()}/me/avatar`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!resp.ok) {
    await handleUnauthorizedResponse(resp);
    const body = await resp.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Avatar upload failed with ${resp.status}.`);
  }
  return resp.json() as Promise<{ avatar_url: string }>;
}

// ── Referrals API (BEO-438) ───────────────────────────────────

export interface ReferralStats {
  referral_code: string;
  referral_link: string;
  signup_count: number;
  upgrade_count: number;
  credits_earned: number;
}

export async function getReferrals(): Promise<ReferralStats> {
  return requestJson<ReferralStats>("/referrals", { method: "GET" });
}

// ── Version History API (BEO-588) ─────────────────────────────

export interface ProjectVersion {
  id: string;
  version_number: number;
  label: string;
  file_count: number;
  created_at: string;
}

export interface ProjectVersionDetail extends ProjectVersion {
  files: Record<string, string>;
}

export async function listProjectVersions(projectId: string): Promise<ProjectVersion[]> {
  return requestJson<ProjectVersion[]>(`/projects/${projectId}/versions`, { method: "GET" });
}

export async function getProjectVersion(
  projectId: string,
  versionId: string,
): Promise<ProjectVersionDetail> {
  return requestJson<ProjectVersionDetail>(
    `/projects/${projectId}/versions/${versionId}`,
    { method: "GET" },
  );
}

export async function restoreProjectVersion(
  projectId: string,
  versionId: string,
): Promise<{ restoredVersionNumber: number; savedVersionNumber: number }> {
  return requestJson<{ restoredVersionNumber: number; savedVersionNumber: number }>(
    `/projects/${projectId}/versions/${versionId}/restore`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function getBillingPortalUrl(returnUrl?: string): Promise<{ url: string }> {
  return requestJson<{ url: string }>("/payments/portal", {
    method: "POST",
    body: JSON.stringify({ returnUrl: returnUrl ?? (typeof window !== "undefined" ? window.location.href : "https://beomz.ai/studio/settings") }),
  });
}

export async function forceSimpleBuild(buildId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/builds/${buildId}/force-simple`, {
    method: "POST",
    body: JSON.stringify({}),
  });
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
    await handleUnauthorizedResponse(response);
    const errorBody = await response.json().catch(() => null) as Record<string, unknown> | null;
    throw new StreamHttpError(response.status, errorBody);
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

/** Create a new project (used by website builder). Returns { id, name }. */
export async function createWebsiteProject(name: string, template = "marketing-website"): Promise<{ id: string; name: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/projects`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, template, project_type: "website" }),
  });
  if (!res.ok) {
    await handleUnauthorizedResponse(res);
    throw new Error(`Failed to create project: ${res.status}`);
  }
  return res.json() as Promise<{ id: string; name: string }>;
}

/** List all projects with project_type = 'website'. */
export async function listWebsiteProjects(): Promise<ProjectsListResponse> {
  const data = await requestJson<ProjectsListResponse>("/projects", { method: "GET" });
  return {
    ...data,
    projects: data.projects.filter((p) => p.projectType === "website"),
  };
}
