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
