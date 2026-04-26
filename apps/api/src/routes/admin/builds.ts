import { createClient } from "@supabase/supabase-js";
import { Hono, type MiddlewareHandler } from "hono";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

type AdminBuildStatus = "building" | "failed" | "success";

interface GenerationAdminRow {
  completed_at: string | null;
  error: string | null;
  id: string;
  project_id: string;
  started_at: string;
  status: string;
}

interface BuildTelemetryAdminRow {
  cost_usd: number | null;
  id: string;
  input_tokens?: number | null;
  output_tokens: number | null;
  user_id: string | null;
}

interface ProjectOwnerRow {
  id: string;
  org_id: string;
}

interface OrgOwnerRow {
  id: string;
  owner_id: string;
}

interface UserEmailRow {
  email: string;
  id: string;
}

export interface AdminBuild {
  completed_at: string | null;
  cost_usd: number | null;
  error_reason: string | null;
  id: string;
  project_id: string;
  started_at: string;
  status: AdminBuildStatus;
  token_usage: number | null;
  user_email: string;
}

export interface AdminBuildStats {
  avg_tokens: number;
  success_rate: number;
  today_failed: number;
  today_success: number;
  today_total: number;
}

interface AdminBuildsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  getBuildStats?: () => Promise<AdminBuildStats>;
  getBuilds?: () => Promise<{
    builds: AdminBuild[];
    in_flight: AdminBuild[];
    recent: AdminBuild[];
  }>;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
}

const IN_FLIGHT_GENERATION_STATUSES = [
  "queued",
  "running",
  "awaiting_scope_confirmation",
] as const;

const FALLBACK_USER_EMAIL = "unknown";
const INPUT_TOKEN_RATE_USD = 0.000003;
const OUTPUT_TOKEN_RATE_USD = 0.000015;

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function roundNumber(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toAdminBuildStatus(status: string): AdminBuildStatus {
  if (status === "completed") {
    return "success";
  }

  if (IN_FLIGHT_GENERATION_STATUSES.includes(status as (typeof IN_FLIGHT_GENERATION_STATUSES)[number])) {
    return "building";
  }

  return "failed";
}

function getBuildErrorReason(row: GenerationAdminRow): string | null {
  const error = row.error?.trim();
  if (error) {
    return error;
  }

  if (row.status === "insufficient_credits") {
    return "Insufficient credits.";
  }

  if (row.status === "cancelled") {
    return "Build cancelled.";
  }

  if (row.status === "failed") {
    return "Build failed.";
  }

  return null;
}

function getTokenUsage(row: BuildTelemetryAdminRow | null | undefined): number | null {
  if (!row) {
    return null;
  }

  const outputTokens = typeof row.output_tokens === "number" ? row.output_tokens : null;
  const inputTokens = typeof row.input_tokens === "number" ? row.input_tokens : null;

  if (inputTokens === null && outputTokens === null) {
    return null;
  }

  return (inputTokens ?? 0) + (outputTokens ?? 0);
}

function getCostUsd(row: BuildTelemetryAdminRow | null | undefined): number | null {
  if (!row) {
    return null;
  }

  const inputTokens = typeof row.input_tokens === "number" ? row.input_tokens : null;
  const outputTokens = typeof row.output_tokens === "number" ? row.output_tokens : null;

  if (inputTokens !== null || outputTokens !== null) {
    return roundNumber(
      ((inputTokens ?? 0) * INPUT_TOKEN_RATE_USD) + ((outputTokens ?? 0) * OUTPUT_TOKEN_RATE_USD),
      6,
    );
  }

  return typeof row.cost_usd === "number" ? row.cost_usd : null;
}

async function fetchGenerationRows(
  client: ReturnType<typeof createStudioAdminClient>,
  mode: "in_flight" | "recent",
): Promise<GenerationAdminRow[]> {
  let query = client
    .from("generations")
    .select("id,project_id,status,started_at,completed_at,error")
    .order("started_at", { ascending: false });

  if (mode === "in_flight") {
    query = query.in("status", [...IN_FLIGHT_GENERATION_STATUSES]);
  } else {
    query = query.in("status", ["completed", "failed", "cancelled", "insufficient_credits"]).limit(50);
  }

  const response = await query;
  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data ?? []) as GenerationAdminRow[];
}

async function fetchGenerationRowsForUtcDay(
  client: ReturnType<typeof createStudioAdminClient>,
  dayStartIso: string,
  nextDayIso: string,
): Promise<GenerationAdminRow[]> {
  const response = await client
    .from("generations")
    .select("id,project_id,status,started_at,completed_at,error")
    .gte("started_at", dayStartIso)
    .lt("started_at", nextDayIso)
    .order("started_at", { ascending: false });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data ?? []) as GenerationAdminRow[];
}

async function fetchBuildTelemetryMap(
  client: ReturnType<typeof createStudioAdminClient>,
  buildIds: string[],
): Promise<Map<string, BuildTelemetryAdminRow>> {
  const telemetryMap = new Map<string, BuildTelemetryAdminRow>();
  if (buildIds.length === 0) {
    return telemetryMap;
  }

  const responseWithInputTokens = await client
    .from("build_telemetry")
    .select("id,user_id,input_tokens,output_tokens,cost_usd")
    .in("id", buildIds);

  let rows: BuildTelemetryAdminRow[] = [];
  if (!responseWithInputTokens.error) {
    rows = (responseWithInputTokens.data ?? []) as BuildTelemetryAdminRow[];
  } else if (/input_tokens/i.test(responseWithInputTokens.error.message)) {
    const fallbackResponse = await client
      .from("build_telemetry")
      .select("id,user_id,output_tokens,cost_usd")
      .in("id", buildIds);

    if (fallbackResponse.error) {
      throw new Error(fallbackResponse.error.message);
    }

    rows = (fallbackResponse.data ?? []) as BuildTelemetryAdminRow[];
  } else {
    throw new Error(responseWithInputTokens.error.message);
  }

  for (const row of rows) {
    telemetryMap.set(row.id, row);
  }

  return telemetryMap;
}

async function fetchUserEmailMap(
  client: ReturnType<typeof createStudioAdminClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const emailByUserId = new Map<string, string>();
  if (userIds.length === 0) {
    return emailByUserId;
  }

  const response = await client
    .from("users")
    .select("id,email")
    .in("id", userIds);

  if (response.error) {
    throw new Error(response.error.message);
  }

  for (const row of (response.data ?? []) as UserEmailRow[]) {
    emailByUserId.set(row.id, row.email);
  }

  return emailByUserId;
}

async function fetchProjectOwnerEmailMap(
  client: ReturnType<typeof createStudioAdminClient>,
  projectIds: string[],
): Promise<Map<string, string>> {
  const projectOwnerEmailMap = new Map<string, string>();
  if (projectIds.length === 0) {
    return projectOwnerEmailMap;
  }

  const projectsResponse = await client
    .from("projects")
    .select("id,org_id")
    .in("id", projectIds);

  if (projectsResponse.error) {
    throw new Error(projectsResponse.error.message);
  }

  const projectRows = (projectsResponse.data ?? []) as ProjectOwnerRow[];
  const orgIds = Array.from(new Set(projectRows.map((row) => row.org_id)));
  if (orgIds.length === 0) {
    return projectOwnerEmailMap;
  }

  const orgsResponse = await client
    .from("orgs")
    .select("id,owner_id")
    .in("id", orgIds);

  if (orgsResponse.error) {
    throw new Error(orgsResponse.error.message);
  }

  const orgRows = (orgsResponse.data ?? []) as OrgOwnerRow[];
  const ownerIds = Array.from(new Set(orgRows.map((row) => row.owner_id)));
  const ownerEmailMap = await fetchUserEmailMap(client, ownerIds);
  const ownerIdByOrgId = new Map(orgRows.map((row) => [row.id, row.owner_id]));

  for (const row of projectRows) {
    const ownerId = ownerIdByOrgId.get(row.org_id);
    const ownerEmail = ownerId ? ownerEmailMap.get(ownerId) : undefined;
    if (ownerEmail) {
      projectOwnerEmailMap.set(row.id, ownerEmail);
    }
  }

  return projectOwnerEmailMap;
}

async function hydrateAdminBuilds(rows: GenerationAdminRow[]): Promise<AdminBuild[]> {
  if (rows.length === 0) {
    return [];
  }

  const client = createStudioAdminClient();
  const buildIds = rows.map((row) => row.id);
  const projectIds = Array.from(new Set(rows.map((row) => row.project_id)));
  const telemetryByBuildId = await fetchBuildTelemetryMap(client, buildIds);
  const telemetryUserIds = Array.from(new Set(
    Array.from(telemetryByBuildId.values())
      .map((row) => row.user_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  ));
  const userEmailsById = await fetchUserEmailMap(client, telemetryUserIds);
  const ownerEmailsByProjectId = await fetchProjectOwnerEmailMap(client, projectIds);

  return rows.map((row) => {
    const telemetry = telemetryByBuildId.get(row.id);
    const telemetryUserEmail = telemetry?.user_id ? userEmailsById.get(telemetry.user_id) : undefined;

    return {
      completed_at: row.completed_at,
      cost_usd: getCostUsd(telemetry),
      error_reason: getBuildErrorReason(row),
      id: row.id,
      project_id: row.project_id,
      started_at: row.started_at,
      status: toAdminBuildStatus(row.status),
      token_usage: getTokenUsage(telemetry),
      user_email: telemetryUserEmail ?? ownerEmailsByProjectId.get(row.project_id) ?? FALLBACK_USER_EMAIL,
    } satisfies AdminBuild;
  });
}

async function getBuildsFromDb() {
  const client = createStudioAdminClient();
  const [inFlightRows, recentRows] = await Promise.all([
    fetchGenerationRows(client, "in_flight"),
    fetchGenerationRows(client, "recent"),
  ]);

  const [inFlight, recent] = await Promise.all([
    hydrateAdminBuilds(inFlightRows),
    hydrateAdminBuilds(recentRows),
  ]);

  return {
    builds: [...inFlight, ...recent],
    in_flight: inFlight,
    recent,
  };
}

function getCurrentUtcDayWindow() {
  const now = new Date();
  const dayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  return {
    dayStartIso: dayStart.toISOString(),
    nextDayIso: nextDay.toISOString(),
  };
}

async function getBuildStatsFromDb(): Promise<AdminBuildStats> {
  const client = createStudioAdminClient();
  const { dayStartIso, nextDayIso } = getCurrentUtcDayWindow();
  const rows = await fetchGenerationRowsForUtcDay(client, dayStartIso, nextDayIso);
  const telemetryByBuildId = await fetchBuildTelemetryMap(client, rows.map((row) => row.id));

  let todaySuccess = 0;
  let todayFailed = 0;
  let tokenTotal = 0;
  let tokenCount = 0;

  for (const row of rows) {
    const adminStatus = toAdminBuildStatus(row.status);
    if (adminStatus === "success") {
      todaySuccess += 1;
    } else if (adminStatus === "failed") {
      todayFailed += 1;
    }

    const tokenUsage = getTokenUsage(telemetryByBuildId.get(row.id));
    if (tokenUsage !== null) {
      tokenTotal += tokenUsage;
      tokenCount += 1;
    }
  }

  const completedCount = todaySuccess + todayFailed;

  return {
    avg_tokens: tokenCount > 0 ? Math.round(tokenTotal / tokenCount) : 0,
    success_rate: completedCount > 0 ? roundNumber((todaySuccess / completedCount) * 100, 2) : 0,
    today_failed: todayFailed,
    today_success: todaySuccess,
    today_total: rows.length,
  };
}

export function createAdminBuildsRoute(deps: AdminBuildsRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;
  const getBuilds = deps.getBuilds ?? getBuildsFromDb;
  const getBuildStats = deps.getBuildStats ?? getBuildStatsFromDb;

  route.get("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const payload = await getBuilds();
      return c.json(payload);
    } catch (error) {
      console.error("[GET /admin/builds] error:", error);
      return c.json({ error: "Failed to load admin builds." }, 500);
    }
  });

  route.get("/stats", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const payload = await getBuildStats();
      return c.json(payload);
    } catch (error) {
      console.error("[GET /admin/builds/stats] error:", error);
      return c.json({ error: "Failed to load admin build stats." }, 500);
    }
  });

  return route;
}

const adminBuildsRoute = createAdminBuildsRoute();

export default adminBuildsRoute;
