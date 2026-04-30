import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { Hono, type MiddlewareHandler } from "hono";

import { apiConfig } from "../../config.js";
import { decryptProjectSecret, encryptProjectSecret } from "../../lib/projectSecrets.js";
import { invalidateProviderKeyCache } from "../../lib/modelConfig.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

const encryptionEnabled = Boolean(apiConfig.ENCRYPTION_SECRET?.trim());
if (!encryptionEnabled) {
  console.warn("[ai-providers] ENCRYPTION_SECRET is not set — API keys will be stored without encryption. Set ENCRYPTION_SECRET in .env to enable encryption.");
}

function safeEncrypt(value: string): string {
  if (!encryptionEnabled) return value;
  return encryptProjectSecret(value);
}

function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  if (!encryptionEnabled) return value;
  return decryptProjectSecret(value);
}

interface AiProviderRow {
  id: string;
  provider: string;
  display_name: string;
  api_key_encrypted: string | null;
  enabled: boolean;
  models: unknown;
  created_at: string;
  updated_at: string;
}

interface AdminAiProvidersRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
}

function createStudioClient() {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function maskApiKey(encrypted: string | null): string | null {
  if (!encrypted) return null;
  const decrypted = safeDecrypt(encrypted);
  if (!decrypted || decrypted.length < 4) return "****";
  return `****${decrypted.slice(-4)}`;
}

async function testProviderConnection(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
      return { success: true };
    }

    const bearerProviders: Record<string, string> = {
      openai: "https://api.openai.com/v1/models",
      moonshot: "https://api.moonshot.cn/v1/models",
      mistral: "https://api.mistral.ai/v1/models",
      groq: "https://api.groq.com/openai/v1/models",
    };

    if (bearerProviders[provider]) {
      const res = await fetch(bearerProviders[provider], {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { success: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { success: true };
    }

    if (provider === "google") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { success: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { success: true };
    }

    return { success: false, error: `Unknown provider: ${provider}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function createAdminAiProvidersRoute(deps: AdminAiProvidersRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;

  const adminMiddlewares = [authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware] as const;

  // GET /admin/ai-providers — list all, mask keys
  route.get("/", ...adminMiddlewares, async (c) => {
    try {
      const db = createStudioClient();
      const { data, error } = await db
        .from("ai_providers")
        .select("*")
        .order("provider");

      if (error) throw error;

      const rows = (data as AiProviderRow[]).map((row) => ({
        ...row,
        api_key_encrypted: undefined,
        api_key_masked: maskApiKey(row.api_key_encrypted),
      }));

      return c.json(rows);
    } catch (err) {
      console.error("[GET /admin/ai-providers] error:", err);
      return c.json({ error: "Failed to load AI providers." }, 500);
    }
  });

  // POST /admin/ai-providers/:provider — upsert API key
  route.post("/:provider", ...adminMiddlewares, async (c) => {
    const { provider } = c.req.param();
    try {
      const body = await c.req.json().catch(() => null) as { api_key?: string } | null;
      const rawKey = body?.api_key?.trim();
      if (!rawKey) {
        return c.json({ error: "api_key is required." }, 400);
      }

      const encrypted = safeEncrypt(rawKey);
      const db = createStudioClient();

      const { data, error } = await db
        .from("ai_providers")
        .update({ api_key_encrypted: encrypted, enabled: true, updated_at: new Date().toISOString() })
        .eq("provider", provider)
        .select("id, provider, display_name, enabled, models, created_at, updated_at")
        .single();

      if (error) throw error;

      invalidateProviderKeyCache(provider);

      return c.json({
        ...data,
        api_key_masked: `****${rawKey.slice(-4)}`,
      });
    } catch (err) {
      console.error(`[POST /admin/ai-providers/${provider}] error:`, err);
      return c.json({ error: "Failed to save API key." }, 500);
    }
  });

  // DELETE /admin/ai-providers/:provider — disable and clear key
  route.delete("/:provider", ...adminMiddlewares, async (c) => {
    const { provider } = c.req.param();
    try {
      const db = createStudioClient();
      const { error } = await db
        .from("ai_providers")
        .update({ api_key_encrypted: null, enabled: false, updated_at: new Date().toISOString() })
        .eq("provider", provider);

      if (error) throw error;

      invalidateProviderKeyCache(provider);

      return c.json({ provider, enabled: false });
    } catch (err) {
      console.error(`[DELETE /admin/ai-providers/${provider}] error:`, err);
      return c.json({ error: "Failed to disable provider." }, 500);
    }
  });

  // POST /admin/ai-providers/:provider/test — test connection
  // Accepts { apiKey } in body to test before saving; falls back to saved DB key.
  route.post("/:provider/test", ...adminMiddlewares, async (c) => {
    const { provider } = c.req.param();
    try {
      const body = await c.req.json().catch(() => null) as { apiKey?: string } | null;
      const bodyKey = body?.apiKey?.trim();

      let keyToTest = bodyKey;

      if (!keyToTest) {
        const db = createStudioClient();
        const { data, error } = await db
          .from("ai_providers")
          .select("api_key_encrypted")
          .eq("provider", provider)
          .single();

        if (error || !data) {
          return c.json({ success: false, error: "Provider not found." }, 404);
        }

        if (!data.api_key_encrypted) {
          return c.json({ success: false, error: "No API key provided or saved for this provider." });
        }

        const decrypted = safeDecrypt(data.api_key_encrypted);
        if (!decrypted) {
          return c.json({ success: false, error: "Failed to decrypt saved API key." });
        }
        keyToTest = decrypted;
      }

      const result = await testProviderConnection(provider, keyToTest);
      return c.json(result);
    } catch (err) {
      console.error(`[POST /admin/ai-providers/${provider}/test] error:`, err);
      return c.json({ success: false, error: "Test failed." }, 500);
    }
  });

  return route;
}

const adminAiProvidersRoute = createAdminAiProvidersRoute();

export default adminAiProvidersRoute;
