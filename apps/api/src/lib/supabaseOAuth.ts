import { createHash, randomBytes } from "node:crypto";

import { apiConfig } from "../config.js";

export const SUPABASE_OAUTH_AUTHORIZE_URL = "https://api.supabase.com/v1/oauth/authorize";
export const SUPABASE_OAUTH_TOKEN_URL = "https://api.supabase.com/v1/oauth/token";
export const SUPABASE_OAUTH_CALLBACK_URL = "https://beomz.ai/api/integrations/supabase/callback";
export const SUPABASE_STUDIO_PROJECT_URL_BASE = "https://beomz.ai/studio/project";
export const SUPABASE_MANAGEMENT_API_BASE = "https://api.supabase.com/v1";
export const SUPABASE_OAUTH_PKCE_COOKIE_NAME = "beomz_supabase_oauth_pkce";
export const SUPABASE_OAUTH_PKCE_TTL_SECONDS = 5 * 60;
export const SUPABASE_OAUTH_TEMP_TOKEN_TTL_MS = 10 * 60 * 1000;

interface SupabaseOAuthTokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SupabaseOAuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number | null;
}

const temporarySupabaseOAuthTokens = new Map<string, SupabaseOAuthTokenRecord>();

function pruneExpiredTemporaryTokens(now = Date.now()): void {
  for (const [projectId, record] of temporarySupabaseOAuthTokens.entries()) {
    if (record.expiresAt <= now) {
      temporarySupabaseOAuthTokens.delete(projectId);
    }
  }
}

export function buildSupabaseOAuthCookieSecret(): string {
  return apiConfig.PROJECT_JWT_SECRET?.trim()
    || apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY;
}

export function generatePkceCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function createPkceCodeChallenge(codeVerifier: string): string {
  return createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
}

export function storeTemporarySupabaseOAuthTokens(
  projectId: string,
  tokens: { accessToken: string; refreshToken: string },
  ttlMs = SUPABASE_OAUTH_TEMP_TOKEN_TTL_MS,
): void {
  pruneExpiredTemporaryTokens();
  temporarySupabaseOAuthTokens.set(projectId, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + ttlMs,
  });
}

export function readTemporarySupabaseOAuthTokens(
  projectId: string,
): { accessToken: string; refreshToken: string } | null {
  pruneExpiredTemporaryTokens();
  const record = temporarySupabaseOAuthTokens.get(projectId);
  if (!record) {
    return null;
  }

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
  };
}

export function clearTemporarySupabaseOAuthTokens(projectId: string): void {
  temporarySupabaseOAuthTokens.delete(projectId);
}

export function clearAllTemporarySupabaseOAuthTokens(): void {
  temporarySupabaseOAuthTokens.clear();
}

function getSupabaseOAuthClientConfig(): { clientId: string; clientSecret: string } {
  const clientId = apiConfig.SUPABASE_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = apiConfig.SUPABASE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("Supabase OAuth is not configured");
  }

  return { clientId, clientSecret };
}

function parseSupabaseOAuthTokenResponse(data: unknown): SupabaseOAuthTokenResponse {
  const accessToken = typeof (data as { access_token?: unknown })?.access_token === "string"
    ? (data as { access_token: string }).access_token.trim()
    : "";
  const refreshToken = typeof (data as { refresh_token?: unknown })?.refresh_token === "string"
    ? (data as { refresh_token: string }).refresh_token.trim()
    : "";
  const expiresInRaw = (data as { expires_in?: unknown })?.expires_in;
  const expiresIn = typeof expiresInRaw === "number"
    ? expiresInRaw
    : typeof expiresInRaw === "string" && expiresInRaw.trim().length > 0
      ? Number.parseInt(expiresInRaw, 10)
      : null;

  if (!accessToken || !refreshToken) {
    throw new Error("Supabase OAuth token response was missing tokens");
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isFinite(expiresIn ?? Number.NaN) ? expiresIn : null,
  };
}

async function requestSupabaseOAuthToken(
  body: URLSearchParams,
  fetchFn: typeof fetch = fetch,
): Promise<SupabaseOAuthTokenResponse> {
  const response = await fetchFn(SUPABASE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Supabase OAuth token exchange failed (${response.status})${message ? `: ${message}` : ""}`,
    );
  }

  return parseSupabaseOAuthTokenResponse(await response.json().catch(() => null));
}

export async function exchangeSupabaseAuthorizationCode(
  input: {
    code: string;
    codeVerifier: string;
  },
  fetchFn: typeof fetch = fetch,
): Promise<SupabaseOAuthTokenResponse> {
  const { clientId, clientSecret } = getSupabaseOAuthClientConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: SUPABASE_OAUTH_CALLBACK_URL,
    code_verifier: input.codeVerifier,
    client_id: clientId,
    client_secret: clientSecret,
  });

  return requestSupabaseOAuthToken(body, fetchFn);
}

export async function refreshSupabaseOAuthTokens(
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<SupabaseOAuthTokenResponse> {
  const { clientId, clientSecret } = getSupabaseOAuthClientConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  return requestSupabaseOAuthToken(body, fetchFn);
}
