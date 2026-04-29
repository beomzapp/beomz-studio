import { createClient } from "@supabase/supabase-js";

import { apiConfig } from "../config.js";
import { decryptProjectSecret } from "./projectSecrets.js";

const CACHE_TTL_MS = 60_000;
let cache: Record<string, string> | null = null;
let cacheTime = 0;

const providerKeyCache = new Map<string, { key: string; ts: number }>();

export const MODEL_DEFAULTS: Record<string, string> = {
  web_apps: "claude-sonnet-4-6",
  websites: "claude-sonnet-4-6",
  agents: "claude-sonnet-4-6",
  chat: "claude-haiku-4-5-20251001",
};

export interface ModelConfig {
  model: string;
  apiKey: string;
  provider: string;
}

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

function inferProviderFromModel(model: string): string {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("moonshot-")) return "moonshot";
  if (model.startsWith("mistral-") || model.startsWith("codestral-")) return "mistral";
  if (model.startsWith("llama-") || model.startsWith("mixtral-")) return "groq";
  return "anthropic";
}

export async function getProviderApiKey(provider: string): Promise<string | null> {
  if (provider === "anthropic") {
    return apiConfig.ANTHROPIC_API_KEY ?? null;
  }

  const cached = providerKeyCache.get(provider);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.key;
  }

  try {
    const client = createModelConfigClient();
    const { data } = await client
      .from("ai_providers")
      .select("api_key_encrypted, enabled")
      .eq("provider", provider)
      .single();

    if (!data?.enabled || !data?.api_key_encrypted) return null;

    const decrypted = decryptProjectSecret(data.api_key_encrypted);
    if (!decrypted) return null;

    providerKeyCache.set(provider, { key: decrypted, ts: Date.now() });
    return decrypted;
  } catch {
    return null;
  }
}

export function invalidateProviderKeyCache(provider?: string): void {
  if (provider) {
    providerKeyCache.delete(provider);
  } else {
    providerKeyCache.clear();
  }
}

export async function getModelConfigForBuilder(
  builder: "web_apps" | "websites" | "agents" | "chat",
): Promise<ModelConfig> {
  const model = await getModelForBuilder(builder);
  const provider = inferProviderFromModel(model);
  const apiKey = (await getProviderApiKey(provider)) ?? apiConfig.ANTHROPIC_API_KEY;
  return { model, apiKey, provider };
}
