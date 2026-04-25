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

export interface RegistrarDetectionResult {
  registrar: string | null;
  docsUrl: string | null;
}

export interface AddedProjectDomain extends VercelProjectDomain, RegistrarDetectionResult {}

export interface ProjectDomainListItem extends RegistrarDetectionResult {
  domain: string;
  verified: boolean;
  verification: VercelDomainVerificationRecord[];
}

type FetchLike = typeof fetch;

type RdapEntity = {
  roles?: unknown;
  vcardArray?: unknown;
};

type RdapResponse = {
  entities?: RdapEntity[];
};

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

function emptyRegistrarDetectionResult(): RegistrarDetectionResult {
  return {
    registrar: null,
    docsUrl: null,
  };
}

function mapRegistrarName(rawRegistrarName: string): RegistrarDetectionResult {
  const upper = rawRegistrarName.toUpperCase();

  if (upper.includes("NAMECHEAP")) {
    return {
      registrar: "Namecheap",
      docsUrl: "https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/",
    };
  }

  if (upper.includes("GODADDY")) {
    return {
      registrar: "GoDaddy",
      docsUrl: "https://www.godaddy.com/help/manage-dns-records-680",
    };
  }

  if (upper.includes("CLOUDFLARE")) {
    return {
      registrar: "Cloudflare",
      docsUrl: "https://dash.cloudflare.com",
    };
  }

  if (upper.includes("GOOGLE") || upper.includes("SQUARESPACE")) {
    return {
      registrar: "Squarespace/Google",
      docsUrl: "https://support.squarespace.com/hc/en-us/articles/360002101888",
    };
  }

  if (upper.includes("AMAZON") || upper.includes("AWS")) {
    return {
      registrar: "AWS Route 53",
      docsUrl: "https://console.aws.amazon.com/route53/v2/hostedzones",
    };
  }

  return emptyRegistrarDetectionResult();
}

function readRegistrarNameFromRdap(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const entities = Array.isArray((body as RdapResponse).entities)
    ? (body as RdapResponse).entities ?? []
    : [];

  for (const entity of entities) {
    const roles = Array.isArray(entity.roles) ? entity.roles : [];
    const hasRegistrarRole = roles.some((role) => typeof role === "string" && role.toLowerCase() === "registrar");
    if (!hasRegistrarRole) {
      continue;
    }

    const vcardEntries = Array.isArray(entity.vcardArray)
      && Array.isArray(entity.vcardArray[1])
      ? entity.vcardArray[1]
      : [];

    for (const entry of vcardEntries) {
      if (!Array.isArray(entry) || entry.length < 4) {
        continue;
      }

      const [propertyName, , , value] = entry;
      if (propertyName !== "fn" || typeof value !== "string" || value.trim().length === 0) {
        continue;
      }

      return value.trim();
    }
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

export async function detectRegistrar(
  domain: string,
  fetchFn: FetchLike = fetch,
): Promise<RegistrarDetectionResult> {
  const normalized = normalizeCustomDomain(domain);
  if (!normalized) {
    return emptyRegistrarDetectionResult();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetchFn(`https://rdap.org/domain/${encodeURIComponent(normalized)}`, {
      method: "GET",
      headers: {
        Accept: "application/rdap+json, application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return emptyRegistrarDetectionResult();
    }

    const body = await response.json().catch(() => null);
    const registrarName = readRegistrarNameFromRdap(body);
    if (!registrarName) {
      return emptyRegistrarDetectionResult();
    }

    return mapRegistrarName(registrarName);
  } catch {
    return emptyRegistrarDetectionResult();
  } finally {
    clearTimeout(timeoutId);
  }
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
): Promise<AddedProjectDomain> {
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
    const projectDomain = body as VercelProjectDomain;
    return {
      ...projectDomain,
      ...await detectRegistrar(projectDomain.apexName || domain, fetchFn),
    };
  }

  if (response.status === 409) {
    await deleteProjectDomain(domain, fetchFn).catch(() => undefined);
    console.log("[vercelDomains] retrying domain add after delete cleanup:", domain, "project:", projectId, "team:", teamId);
    response = await sendAddRequest();
    ({ parsed: body, raw } = await readResponseBody(response));
    console.log("[vercelDomains] Vercel response:", response.status, JSON.stringify(body));

    if (response.ok) {
      const projectDomain = body as VercelProjectDomain;
      return {
        ...projectDomain,
        ...await detectRegistrar(projectDomain.apexName || domain, fetchFn),
      };
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

  const registrarLookups = new Map<string, Promise<RegistrarDetectionResult>>();

  return Promise.all(
    domains.map(async (domain) => {
      try {
        const result = await getProjectDomain(domain, fetchFn);
        const lookupDomain = normalizeCustomDomain(result.apexName || domain) ?? domain;
        let registrarLookup = registrarLookups.get(lookupDomain);
        if (!registrarLookup) {
          registrarLookup = detectRegistrar(lookupDomain, fetchFn);
          registrarLookups.set(lookupDomain, registrarLookup);
        }
        const registrarResult = await registrarLookup;

        return {
          domain,
          verified: result.verified === true,
          verification: result.verified === true
            ? []
            : Array.isArray(result.verification) ? result.verification : [],
          ...registrarResult,
        };
      } catch (error) {
        if (error instanceof VercelApiError && error.status === 404) {
          return { domain, verified: false, verification: [], ...emptyRegistrarDetectionResult() };
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
