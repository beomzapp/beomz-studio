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
