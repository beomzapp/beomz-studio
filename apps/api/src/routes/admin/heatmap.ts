import { createClient } from "@supabase/supabase-js";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

const heatmapRangeSchema = z.enum(["1h", "24h", "7d", "all"]);
const heatmapQuerySchema = z.object({
  range: heatmapRangeSchema.default("24h"),
});

const LOGIN_EVENTS_PAGE_SIZE = 1_000;

interface AdminHeatmapRouteDeps {
  authMiddleware?: MiddlewareHandler;
  getHeatmap?: (range: z.infer<typeof heatmapRangeSchema>) => Promise<AdminHeatmapPoint[]>;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
}

interface LoginEventRow {
  country_code: string | null;
  country_name: string | null;
  created_at: string;
  lat: number | string | null;
  lng: number | string | null;
  user_id: string | null;
}

interface HeatmapAccumulator {
  active: number;
  country_code: string;
  country_name: string;
  latTotal: number;
  lngTotal: number;
  total: number;
}

export interface AdminHeatmapPoint {
  active: number;
  country_code: string;
  country_name: string;
  lat: number;
  lng: number;
  total: number;
}

const ACTIVE_USER_WINDOW_MS = 30 * 60 * 1000;

function createStudioAdminClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toNumericCoordinate(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRangeStartIso(range: z.infer<typeof heatmapRangeSchema>): string | null {
  if (range === "all") {
    return null;
  }

  const now = Date.now();
  const durationMs = range === "1h"
    ? 60 * 60 * 1000
    : range === "24h"
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

  return new Date(now - durationMs).toISOString();
}

async function fetchLoginEventRows(
  client: ReturnType<typeof createStudioAdminClient>,
  range: z.infer<typeof heatmapRangeSchema>,
): Promise<LoginEventRow[]> {
  const rows: LoginEventRow[] = [];
  const rangeStartIso = getRangeStartIso(range);

  for (let from = 0; ; from += LOGIN_EVENTS_PAGE_SIZE) {
    let query = client
      .from("login_events")
      .select("user_id,country_code,country_name,lat,lng,created_at")
      .order("created_at", { ascending: false })
      .range(from, from + LOGIN_EVENTS_PAGE_SIZE - 1);

    if (rangeStartIso) {
      query = query.gte("created_at", rangeStartIso);
    }

    const response = await query;
    if (response.error) {
      throw new Error(response.error.message);
    }

    const page = (response.data ?? []) as LoginEventRow[];
    rows.push(...page);

    if (page.length < LOGIN_EVENTS_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

export function buildHeatmap(rows: LoginEventRow[], now = Date.now()): AdminHeatmapPoint[] {
  const latestRowsByUserId = new Map<string, LoginEventRow>();
  const aggregates = new Map<string, HeatmapAccumulator>();
  const activeCutoff = now - ACTIVE_USER_WINDOW_MS;

  for (const row of rows) {
    const userId = row.user_id?.trim();
    if (!userId || latestRowsByUserId.has(userId)) {
      continue;
    }

    latestRowsByUserId.set(userId, row);
  }

  for (const row of latestRowsByUserId.values()) {
    const countryCode = row.country_code?.trim();
    const countryName = row.country_name?.trim();
    const lat = toNumericCoordinate(row.lat);
    const lng = toNumericCoordinate(row.lng);
    const createdAtMs = Date.parse(row.created_at);

    if (!countryCode || !countryName || lat === null || lng === null || Number.isNaN(createdAtMs)) {
      continue;
    }

    const aggregate = aggregates.get(countryCode) ?? {
      active: 0,
      country_code: countryCode,
      country_name: countryName,
      latTotal: 0,
      lngTotal: 0,
      total: 0,
    };

    aggregate.total += 1;
    if (createdAtMs >= activeCutoff) {
      aggregate.active += 1;
    }
    aggregate.latTotal += lat;
    aggregate.lngTotal += lng;
    aggregates.set(countryCode, aggregate);
  }

  return Array.from(aggregates.values())
    .map((aggregate) => ({
      active: aggregate.active,
      country_code: aggregate.country_code,
      country_name: aggregate.country_name,
      lat: roundCoordinate(aggregate.latTotal / aggregate.total),
      lng: roundCoordinate(aggregate.lngTotal / aggregate.total),
      total: aggregate.total,
    }))
    .sort((a, b) => b.total - a.total || b.active - a.active || a.country_code.localeCompare(b.country_code));
}

async function getHeatmapFromDb(range: z.infer<typeof heatmapRangeSchema>): Promise<AdminHeatmapPoint[]> {
  const client = createStudioAdminClient();
  const rows = await fetchLoginEventRows(client, range);
  return buildHeatmap(rows);
}

export function createAdminHeatmapRoute(deps: AdminHeatmapRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;
  const getHeatmap = deps.getHeatmap ?? getHeatmapFromDb;

  route.get("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const parsed = heatmapQuerySchema.safeParse({
        range: c.req.query("range"),
      });

      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid heatmap query." }, 400);
      }

      const payload = await getHeatmap(parsed.data.range);
      return c.json(payload);
    } catch (error) {
      console.error("[GET /admin/heatmap] error:", error);
      return c.json({ error: "Failed to load admin heatmap." }, 500);
    }
  });

  return route;
}

const adminHeatmapRoute = createAdminHeatmapRoute();

export default adminHeatmapRoute;
