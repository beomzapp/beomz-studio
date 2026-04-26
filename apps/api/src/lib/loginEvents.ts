import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";

import { apiConfig } from "../config.js";

const IP_API_FIELDS = "status,country,countryCode,lat,lon";
const IP_API_TIMEOUT_MS = 3_000;
const LOGIN_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const LOGIN_SESSION_PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const SHARED_LOGIN_SESSIONS = new Map<string, number>();

let lastLoginSessionPruneAt = 0;

export interface QueueLoginEventInput {
  accessToken: string;
  ip: string;
  userId: string;
}

interface IpApiSuccessResponse {
  country?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
  status: "success";
}

interface IpApiFailureResponse {
  message?: string;
  status: "fail";
}

type IpApiResponse = IpApiFailureResponse | IpApiSuccessResponse;

interface LoginEventLocation {
  country_code: string | null;
  country_name: string | null;
  lat: number | null;
  lng: number | null;
}

interface LoginSessionOptions {
  now?: () => number;
  seenSessions?: Map<string, number>;
}

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeIp(rawValue: string | null | undefined): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const value = rawValue.trim();
  if (value.length === 0) {
    return null;
  }

  if (value.startsWith("::ffff:")) {
    return value.slice("::ffff:".length);
  }

  const bracketedIpv6Match = /^\[([^[\]]+)\](?::\d+)?$/.exec(value);
  if (bracketedIpv6Match) {
    return bracketedIpv6Match[1] ?? null;
  }

  const ipv4WithPortMatch = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (ipv4WithPortMatch) {
    return ipv4WithPortMatch[1] ?? null;
  }

  return value;
}

export function extractClientIp(input: {
  forwardedFor?: string | null;
  socketRemoteAddress?: string | null;
}): string | null {
  const forwardedFor = typeof input.forwardedFor === "string"
    ? input.forwardedFor
    : "";

  const forwardedIp = forwardedFor
    .split(",")
    .map((value) => normalizeIp(value))
    .find((value): value is string => typeof value === "string" && value.length > 0);

  if (forwardedIp) {
    return forwardedIp;
  }

  return normalizeIp(input.socketRemoteAddress);
}

function readSocketRemoteAddress(c: Pick<Context, "env">): string | null {
  const bindings = c.env as { incoming?: { socket?: { remoteAddress?: string | undefined } } } | undefined;
  return normalizeIp(bindings?.incoming?.socket?.remoteAddress);
}

export function extractLoginEventIp(c: Pick<Context, "env" | "req">): string | null {
  return extractClientIp({
    forwardedFor: c.req.header("x-forwarded-for"),
    socketRemoteAddress: readSocketRemoteAddress(c),
  });
}

function buildSessionKey(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}

function pruneSeenSessions(seenSessions: Map<string, number>, now: number) {
  if (now - lastLoginSessionPruneAt < LOGIN_SESSION_PRUNE_INTERVAL_MS) {
    return;
  }

  lastLoginSessionPruneAt = now;
  for (const [key, seenAt] of seenSessions.entries()) {
    if (now - seenAt > LOGIN_SESSION_TTL_MS) {
      seenSessions.delete(key);
    }
  }
}

export function tryMarkLoginSessionSeen(
  accessToken: string,
  options: LoginSessionOptions = {},
): boolean {
  const normalizedToken = accessToken.trim();
  if (normalizedToken.length === 0) {
    return false;
  }

  const now = options.now?.() ?? Date.now();
  const seenSessions = options.seenSessions ?? SHARED_LOGIN_SESSIONS;
  pruneSeenSessions(seenSessions, now);

  const sessionKey = buildSessionKey(normalizedToken);
  const seenAt = seenSessions.get(sessionKey);
  if (typeof seenAt === "number" && now - seenAt <= LOGIN_SESSION_TTL_MS) {
    return false;
  }

  seenSessions.set(sessionKey, now);
  return true;
}

async function lookupIpLocation(
  ip: string,
  fetchFn: typeof fetch = fetch,
): Promise<LoginEventLocation> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, IP_API_TIMEOUT_MS);

  try {
    const response = await fetchFn(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${IP_API_FIELDS}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        country_code: null,
        country_name: null,
        lat: null,
        lng: null,
      };
    }

    const payload = await response.json() as IpApiResponse;
    if (payload.status !== "success") {
      return {
        country_code: null,
        country_name: null,
        lat: null,
        lng: null,
      };
    }

    return {
      country_code: typeof payload.countryCode === "string" ? payload.countryCode : null,
      country_name: typeof payload.country === "string" ? payload.country : null,
      lat: typeof payload.lat === "number" ? payload.lat : null,
      lng: typeof payload.lon === "number" ? payload.lon : null,
    };
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AbortError") {
      console.error("[loginEvents] ip lookup failed:", error);
    }

    return {
      country_code: null,
      country_name: null,
      lat: null,
      lng: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function insertLoginEvent(
  input: QueueLoginEventInput,
  fetchFn: typeof fetch = fetch,
) {
  const location = await lookupIpLocation(input.ip, fetchFn);
  const client = createStudioAdminClient();

  const response = await client.from("login_events").insert({
    country_code: location.country_code,
    country_name: location.country_name,
    ip: input.ip,
    lat: location.lat,
    lng: location.lng,
    user_id: input.userId,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
}

export function queueLoginEvent(
  input: QueueLoginEventInput,
  options: LoginSessionOptions & { fetchFn?: typeof fetch } = {},
) {
  if (
    input.accessToken.trim().length === 0
    || input.ip.trim().length === 0
    || input.userId.trim().length === 0
  ) {
    return;
  }

  if (!tryMarkLoginSessionSeen(input.accessToken, options)) {
    return;
  }

  void insertLoginEvent(input, options.fetchFn).catch((error) => {
    console.error("[loginEvents] insert failed:", error);
  });
}
