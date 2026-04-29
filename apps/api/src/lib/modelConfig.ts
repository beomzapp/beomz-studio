import { createClient } from "@supabase/supabase-js";

import { apiConfig } from "../config.js";

const CACHE_TTL_MS = 60_000;
let cache: Record<string, string> | null = null;
let cacheTime = 0;

export const MODEL_DEFAULTS: Record<string, string> = {
  web_apps: "claude-sonnet-4-6",
  websites: "claude-sonnet-4-6",
  agents: "claude-sonnet-4-6",
  chat: "claude-haiku-4-5-20251001",
};

function createModelConfigClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getModelForBuilder(
  builder: "web_apps" | "websites" | "agents" | "chat",
): Promise<string> {
  const now = Date.now();
  if (!cache || now - cacheTime > CACHE_TTL_MS) {
    try {
      const client = createModelConfigClient();
      const { data } = await client
        .from("feature_flags")
        .select("value")
        .eq("key", "ai_models")
        .single();
      cache = (data?.value as Record<string, string>) ?? MODEL_DEFAULTS;
    } catch {
      cache = MODEL_DEFAULTS;
    }
    cacheTime = now;
  }
  return cache[builder] ?? MODEL_DEFAULTS[builder];
}

export function invalidateModelCache(): void {
  cache = null;
  cacheTime = 0;
}
