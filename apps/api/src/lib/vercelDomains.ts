import type { ProjectRow } from "@beomz-studio/studio-db";

import { apiConfig } from "../config.js";
import { assignDeploymentAlias } from "./vercelDeploy.js";

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

interface VercelAliasRecord {
  alias: string;
  deploymentId: string | null;
  createdAt?: number;
  updatedAt?: number;
}

interface VercelAliasesResponse {
  aliases?: VercelAliasRecord[];
}

type FetchLike = typeof fetch;

export class VercelApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Vercel API request failed (${status}): ${body}`);
    this.name = "VercelApiError";
    this.status = status;
    this.body = body;
  }
}

function requireVercelConfig(): { token: string; projectId: string; teamId: string } {
  const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = apiConfig;
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID || !VERCEL_TEAM_ID) {
    throw new Error("Vercel env vars not configured (VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID)");
  }
  return {
    token: VERCEL_TOKEN,
    projectId: VERCEL_PROJECT_ID,
    teamId: VERCEL_TEAM_ID,
  };
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
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new VercelApiError(response.status, body);
  }

  return response.json() as Promise<T>;
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

export function getProjectAliasDomain(project: Pick<ProjectRow, "beomz_app_url" | "published_slug">): string | null {
  if (typeof project.beomz_app_url === "string" && project.beomz_app_url.trim().length > 0) {
    try {
      return new URL(project.beomz_app_url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  if (typeof project.published_slug === "string" && project.published_slug.trim().length > 0) {
    return `${project.published_slug.trim().toLowerCase()}.beomz.app`;
  }

  return null;
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
  const { projectId } = requireVercelConfig();
  return vercelRequest<VercelProjectDomain>(
    `/v10/projects/${projectId}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    },
    {},
    fetchFn,
  );
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
    const body = await response.text().catch(() => "");
    throw new VercelApiError(response.status, body);
  }
}

export async function resolveDeploymentIdForAlias(
  aliasDomain: string,
  fetchFn: FetchLike = fetch,
): Promise<string | null> {
  const { projectId } = requireVercelConfig();
  const result = await vercelRequest<VercelAliasesResponse>(
    "/v4/aliases",
    { method: "GET" },
    {
      projectId,
      domain: aliasDomain,
      limit: 20,
    },
    fetchFn,
  );

  const aliases = Array.isArray(result.aliases) ? result.aliases : [];
  const matching = aliases
    .filter((entry) => entry.alias === aliasDomain && typeof entry.deploymentId === "string" && entry.deploymentId.length > 0)
    .sort((left, right) => (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0));

  return matching[0]?.deploymentId ?? null;
}

export async function assignDomainToCurrentDeployment(
  project: Pick<ProjectRow, "beomz_app_url" | "published_slug">,
  domain: string,
  fetchFn: FetchLike = fetch,
): Promise<string> {
  const aliasDomain = getProjectAliasDomain(project);
  if (!aliasDomain) {
    throw new Error("Project does not have an active beomz.app deployment.");
  }

  const deploymentId = await resolveDeploymentIdForAlias(aliasDomain, fetchFn);
  if (!deploymentId) {
    throw new Error(`Could not resolve deployment for alias ${aliasDomain}.`);
  }

  const { token, teamId } = requireVercelConfig();
  await assignDeploymentAlias(token, teamId, deploymentId, domain);
  return deploymentId;
}
