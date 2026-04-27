const DEFAULT_API_BASE_URL = "https://beomz.ai/api";

export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export interface MeResponse {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  building_for: string | null;
  referral_source: string | null;
  onboarding_completed: boolean;
  workspace_knowledge: string | null;
  created_at: string;
  plan: string;
  credits: number;
  is_admin?: boolean;
}

export async function fetchMe(accessToken: string): Promise<MeResponse | null> {
  const res = await fetch(`${getApiBaseUrl()}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<MeResponse>;
}

// ── Admin: Users ──────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  credits: number;
  created_at: string;
  last_active: string | null;
  org_id: string | null;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface CreditHistoryEntry {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
  balance_after: number | null;
  actor: string | null;
}

export interface AdminUsersParams {
  search?: string;
  plan?: string;
  page?: number;
  limit?: number;
}

export async function fetchAdminUsers(
  accessToken: string,
  params: AdminUsersParams,
): Promise<AdminUsersResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.plan) q.set("plan", params.plan);
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.limit !== undefined) q.set("limit", String(params.limit));

  const res = await fetch(`${getApiBaseUrl()}/admin/users?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<AdminUsersResponse>;
}

export async function fetchUserCreditHistory(
  accessToken: string,
  userId: string,
): Promise<CreditHistoryEntry[]> {
  const res = await fetch(`${getApiBaseUrl()}/admin/users/${userId}/credits`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as CreditHistoryEntry[] | { history: CreditHistoryEntry[] };
  return Array.isArray(data) ? data : (data.history ?? []);
}

export async function postCreditAdjustment(
  accessToken: string,
  userId: string,
  delta: number,
  reason: string,
): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/admin/users/${userId}/credits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ delta, reason }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
}

// ── Admin: Builds ─────────────────────────────────────────────────────────────

export type BuildStatus = "building" | "success" | "failed";

export interface AdminBuild {
  id: string;
  user_email: string | null;
  status: BuildStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  tokens_used: number | null;
  error_reason: string | null;
}

export interface AdminBuildsResponse {
  in_flight: AdminBuild[];
  recent: AdminBuild[];
}

export interface AdminBuildStats {
  today_total: number;
  today_success: number;
  today_failed: number;
  success_rate: number | null;
}

export async function fetchAdminBuilds(accessToken: string): Promise<AdminBuildsResponse> {
  const res = await fetch(`${getApiBaseUrl()}/admin/builds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<AdminBuildsResponse>;
}

export async function fetchAdminBuildStats(accessToken: string): Promise<AdminBuildStats> {
  const res = await fetch(`${getApiBaseUrl()}/admin/builds/stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<AdminBuildStats>;
}

// ── Admin: Heatmap ────────────────────────────────────────────────────────────

export type HeatmapRange = "1h" | "24h" | "7d" | "all";

export interface HeatmapEntry {
  country_code: string;
  country_name: string;
  lat: number;
  lng: number;
  count: number;
}

export async function fetchAdminHeatmap(
  accessToken: string,
  range: HeatmapRange,
): Promise<HeatmapEntry[]> {
  const res = await fetch(`${getApiBaseUrl()}/admin/heatmap?range=${range}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<HeatmapEntry[]>;
}

// ── Admin: Credit Ledger ──────────────────────────────────────────────────────

export type CreditSource = "build" | "referral" | "manual_admin" | "stripe";

export interface AdminCreditTransaction {
  id: string;
  user_email: string;
  delta: number;
  source: CreditSource | string;
  reason: string;
  created_at: string;
}

export interface AdminCreditsResponse {
  transactions: AdminCreditTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminCreditsParams {
  source?: string;
  page?: number;
  limit?: number;
}

export async function fetchAdminCredits(
  accessToken: string,
  params: AdminCreditsParams = {},
): Promise<AdminCreditsResponse> {
  const q = new URLSearchParams();
  if (params.source) q.set("source", params.source);
  if (params.page !== undefined) q.set("page", String(params.page));
  if (params.limit !== undefined) q.set("limit", String(params.limit));

  const res = await fetch(`${getApiBaseUrl()}/admin/credits?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<AdminCreditsResponse>;
}
