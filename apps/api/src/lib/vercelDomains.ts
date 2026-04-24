import type { ProjectRow } from "@beomz-studio/studio-db";

import { requireVercelConfig } from "./vercelDeploy.js";

export interface VercelDomainVerificationRecord {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

export interface VercelProjectDomain {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
  redirect?: string | null;
  redirectStatusCode?: number | null;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
  updatedAt?: number;
  createdAt?: number;
  verification?: VercelDomainVerificationRecord[];
}

export interface ProjectDomainListItem {
  domain: string;
  verified: boolean;
  verification: VercelDomainVerificationRecord[];
}

type FetchLike = typeof fetch;

export class VercelApiError extends Error {
  status: number;
  body: unknown;
  rawBody: string;
  friendlyMessage: string;
  code: string | null;

  constructor(status: number, body: unknown, options: { rawBody?: string; friendlyMessage?: string; code?: string | null } = {}) {
    const rawBody = options.rawBody ?? stringifyLogBody(body);
    super(`Vercel API request failed (${status}): ${rawBody}`);
    this.name = "VercelApiError";
    this.status = status;
    this.body = body;
    this.rawBody = rawBody;
    this.friendlyMessage = options.friendlyMessage ?? getFriendlyVercelErrorMessage(status);
    this.code = options.code ?? readVercelErrorCode(body);
  }
}

function stringifyLogBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

async function readResponseBody(response: Response): Promise<{ parsed: unknown; raw: string }> {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return { parsed: null, raw };
  }

  try {
    return {
      parsed: JSON.parse(raw) as unknown,
      raw,
    };
  } catch {
    return {
      parsed: raw,
      raw,
    };
  }
}

function readVercelErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const code = (body as { code?: unknown }).code;
  if (typeof code === "string" && code.trim().length > 0) {
    return code;
  }

  const nestedCode = (body as { error?: { code?: unknown } }).error?.code;
  if (typeof nestedCode === "string" && nestedCode.trim().length > 0) {
    return nestedCode;
  }

  return null;
}

export function getFriendlyVercelErrorMessage(status: number): string {
  switch (status) {
    case 409:
      return "This domain is already in use on another project.";
    case 400:
      return "Invalid domain name. Please check and try again.";
    case 403:
      return "Domain not allowed. Please try a different domain.";
    case 402:
      return "Payment required. Please check your Vercel account.";
    default:
      return "Failed to add domain. Please try again.";
  }
}

function createVercelApiError(status: number, body: unknown, rawBody?: string): VercelApiError {
  return new VercelApiError(status, body, {
    rawBody,
    friendlyMessage: getFriendlyVercelErrorMessage(status),
  });
}

function buildTeamScopedUrl(pathname: string, query: Record<string, string | number | null | undefined> = {}): string {
  const { teamId } = requireVercelConfig();
  const url = new URL(`https://api.vercel.com${pathname}`);
  url.searchParams.set("teamId", teamId);

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function readJsonOrThrow<T>(
  response: Response,
): Promise<T> {
  const { parsed, raw } = await readResponseBody(response);
  if (!response.ok) {
    throw createVercelApiError(response.status, parsed, raw);
  }

  return parsed as T;
}

async function vercelRequest<T>(
  pathname: string,
  init: RequestInit = {},
  query: Record<string, string | number | null | undefined> = {},
  fetchFn: FetchLike = fetch,
): Promise<T> {
  const { token } = requireVercelConfig();
  const response = await fetchFn(buildTeamScopedUrl(pathname, query), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  return readJsonOrThrow<T>(response);
}

export function normalizeCustomDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase().replace(/\.+$/, "");
  if (!trimmed || trimmed.length > 253) {
    return null;
  }

  if (
    trimmed.includes("://")
    || trimmed.includes("/")
    || trimmed.includes("?")
    || trimmed.includes("#")
    || trimmed.includes("@")
    || trimmed.includes(":")
    || trimmed.startsWith(".")
    || trimmed.includes("..")
  ) {
    return null;
  }

  const labels = trimmed.split(".");
  if (labels.length < 2) {
    return null;
  }

  for (const label of labels) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      return null;
    }
  }

  return trimmed;
}

export function readProjectCustomDomains(project: Pick<ProjectRow, "custom_domains">): string[] {
  if (!Array.isArray(project.custom_domains)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of project.custom_domains) {
    if (typeof entry !== "string") {
      continue;
    }
    const normalized = normalizeCustomDomain(entry);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

export function addDomainToProjectRecord(
  project: Pick<ProjectRow, "custom_domains">,
  domain: string,
): string[] {
  const next = new Set(readProjectCustomDomains(project));
  next.add(domain);
  return [...next];
}

export function removeDomainFromProjectRecord(
  project: Pick<ProjectRow, "custom_domains">,
  domain: string,
): string[] {
  return readProjectCustomDomains(project).filter((entry) => entry !== domain);
}

export async function addProjectDomain(
  domain: string,
  fetchFn: FetchLike = fetch,
): Promise<VercelProjectDomain> {
  const { token, projectId, teamId } = requireVercelConfig();
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: domain }),
  };

  const sendAddRequest = () => fetchFn(
    buildTeamScopedUrl(`/v10/projects/${projectId}/domains`),
    requestInit,
  );

  console.log("[vercelDomains] adding domain:", domain, "to project:", projectId, "team:", teamId);

  let response = await sendAddRequest();
  let { parsed: body, raw } = await readResponseBody(response);
  console.log("[vercelDomains] Vercel response:", response.status, JSON.stringify(body));

  if (response.ok) {
    return body as VercelProjectDomain;
  }

  if (response.status === 409) {
    await deleteProjectDomain(domain, fetchFn).catch(() => undefined);
    console.log("[vercelDomains] retrying domain add after delete cleanup:", domain, "project:", projectId, "team:", teamId);
    response = await sendAddRequest();
    ({ parsed: body, raw } = await readResponseBody(response));
    console.log("[vercelDomains] Vercel response:", response.status, JSON.stringify(body));

    if (response.ok) {
      return body as VercelProjectDomain;
    }
  }

  throw createVercelApiError(response.status, body, raw);
}

export async function verifyProjectDomain(
  domain: string,
  fetchFn: FetchLike = fetch,
): Promise<VercelProjectDomain> {
  const { projectId } = requireVercelConfig();
  return vercelRequest<VercelProjectDomain>(
    `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`,
    { method: "POST" },
    {},
    fetchFn,
  );
}

export async function getProjectDomain(
  domain: string,
  fetchFn: FetchLike = fetch,
): Promise<VercelProjectDomain> {
  const { projectId } = requireVercelConfig();
  return vercelRequest<VercelProjectDomain>(
    `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
    { method: "GET" },
    {},
    fetchFn,
  );
}

export async function listProjectDomains(
  project: Pick<ProjectRow, "custom_domains">,
  fetchFn: FetchLike = fetch,
): Promise<ProjectDomainListItem[]> {
  const domains = readProjectCustomDomains(project);
  if (domains.length === 0) {
    return [];
  }

  return Promise.all(
    domains.map(async (domain) => {
      try {
        const result = await getProjectDomain(domain, fetchFn);
        return {
          domain,
          verified: result.verified === true,
          verification: result.verified === true
            ? []
            : Array.isArray(result.verification) ? result.verification : [],
        };
      } catch (error) {
        if (error instanceof VercelApiError && error.status === 404) {
          return { domain, verified: false, verification: [] };
        }
        throw error;
      }
    }),
  );
}

export async function deleteProjectDomain(
  domain: string,
  fetchFn: FetchLike = fetch,
): Promise<void> {
  const { token, projectId } = requireVercelConfig();
  const response = await fetchFn(
    buildTeamScopedUrl(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`),
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const { parsed, raw } = await readResponseBody(response);
    throw new VercelApiError(response.status, parsed, { rawBody: raw });
  }
}
