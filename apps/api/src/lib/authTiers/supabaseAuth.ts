import type { AuthTier, AuthUser } from "./shared.js";
import { AuthTierError } from "./shared.js";

interface SupabaseAuthConfig {
  serviceKey: string;
  supabaseUrl: string;
}

interface SupabaseAuthDeps {
  fetchFn?: typeof fetch;
}

function buildBaseHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

function buildTokenHeaders(token: string, serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${token}`,
  };
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.msg,
    record.message,
    record.error_description,
    record.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return fallback;
}

function normalizeUser(input: unknown): AuthUser {
  const record = (input ?? {}) as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const email = typeof record.email === "string" ? record.email : "";
  const role = typeof record.role === "string" && record.role.trim().length > 0
    ? record.role
    : "authenticated";

  if (!id || !email) {
    throw new AuthTierError(502, "Supabase auth response missing user details");
  }

  return { id, email, role };
}

function readAccessToken(payload: unknown): string {
  const record = (payload ?? {}) as Record<string, unknown>;
  const topLevelToken = typeof record.access_token === "string" ? record.access_token : null;
  if (topLevelToken) {
    return topLevelToken;
  }

  const session = (record.session ?? null) as Record<string, unknown> | null;
  const sessionToken = typeof session?.access_token === "string" ? session.access_token : null;
  if (sessionToken) {
    return sessionToken;
  }

  throw new AuthTierError(502, "Supabase auth did not return a session token");
}

async function parseSupabaseResponse(
  response: Response,
  fallbackMessage: string,
): Promise<unknown> {
  const rawText = await response.text().catch(() => "");
  let payload: unknown = null;

  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    throw new AuthTierError(response.status, extractErrorMessage(payload, fallbackMessage));
  }

  return payload;
}

export function createSupabaseAuthTier(
  config: SupabaseAuthConfig,
  deps: SupabaseAuthDeps = {},
): AuthTier {
  const fetchFn = deps.fetchFn ?? fetch;
  const supabaseUrl = config.supabaseUrl.replace(/\/$/, "");

  return {
    kind: "supabase",

    async signup(email, password) {
      const response = await fetchFn(`${supabaseUrl}/auth/v1/signup`, {
        method: "POST",
        headers: buildBaseHeaders(config.serviceKey),
        body: JSON.stringify({ email, password }),
      });

      const payload = await parseSupabaseResponse(response, "Supabase signup failed");
      const record = payload as Record<string, unknown>;

      return {
        user: normalizeUser(record.user),
        token: readAccessToken(record),
      };
    },

    async login(email, password) {
      const response = await fetchFn(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: buildBaseHeaders(config.serviceKey),
        body: JSON.stringify({ email, password }),
      });

      const payload = await parseSupabaseResponse(response, "Supabase login failed");
      const record = payload as Record<string, unknown>;

      return {
        user: normalizeUser(record.user),
        token: readAccessToken(record),
      };
    },

    async logout(token) {
      const response = await fetchFn(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: buildTokenHeaders(token, config.serviceKey),
      });

      await parseSupabaseResponse(response, "Supabase logout failed");
      return { success: true };
    },

    async me(token) {
      const response = await fetchFn(`${supabaseUrl}/auth/v1/user`, {
        headers: buildTokenHeaders(token, config.serviceKey),
      });

      const payload = await parseSupabaseResponse(response, "Supabase user lookup failed");
      return {
        user: normalizeUser(payload),
      };
    },
  };
}
