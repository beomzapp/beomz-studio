import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import { updateFeatureFlagsInDb, listFeatureFlagsFromDb, type FeatureFlagsMap } from "../../lib/featureFlags.js";
import { broadcastModelCacheInvalidation, invalidateModelCache, MODEL_DEFAULTS } from "../../lib/modelConfig.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

const aiModelsBodySchema = z.object({
  web_apps: z.string().min(1).optional(),
  websites: z.string().min(1).optional(),
  agents: z.string().min(1).optional(),
  chat: z.string().min(1).optional(),
}).refine(
  (body) => Object.keys(body).length > 0,
  { message: "At least one model key is required." },
);

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
}

interface EnabledProvidersResult {
  availableModels: AvailableModel[];
  enabledProviders: Set<string>;
}

function createStudioClient(): SupabaseClient {
  return createClient(apiConfig.STUDIO_SUPABASE_URL, apiConfig.STUDIO_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listEnabledProvidersFromDb(): Promise<EnabledProvidersResult> {
  const client = createStudioClient();
  const { data, error } = await client
    .from("ai_providers")
    .select("provider, enabled, models")
    .eq("enabled", true);

  if (error) throw new Error(error.message);

  const availableModels: AvailableModel[] = [];
  const enabledProviders = new Set<string>();

  for (const row of (data ?? []) as Array<{ provider: string; enabled: boolean; models: unknown }>) {
    if (!row.enabled) continue;
    enabledProviders.add(row.provider);
    if (!Array.isArray(row.models)) continue;
    for (const entry of row.models) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as { id?: unknown; name?: unknown };
      if (typeof e.id !== "string" || !e.id) continue;
      const name = typeof e.name === "string" && e.name ? e.name : e.id;
      availableModels.push({ id: e.id, name, provider: row.provider });
    }
  }

  return { availableModels, enabledProviders };
}

interface AdminAiModelsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  getFeatureFlags?: () => Promise<FeatureFlagsMap>;
  listEnabledProviders?: () => Promise<EnabledProvidersResult>;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
  updateFeatureFlags?: (input: FeatureFlagsMap) => Promise<FeatureFlagsMap>;
}

export function createAdminAiModelsRoute(deps: AdminAiModelsRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const getFeatureFlags = deps.getFeatureFlags ?? listFeatureFlagsFromDb;
  const listEnabledProviders = deps.listEnabledProviders ?? listEnabledProvidersFromDb;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;
  const updateFeatureFlags = deps.updateFeatureFlags ?? updateFeatureFlagsInDb;

  route.get("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const [flags, providers] = await Promise.all([
        getFeatureFlags(),
        listEnabledProviders().catch((err) => {
          console.error("[GET /admin/ai-models] failed to list providers:", err);
          return { availableModels: [], enabledProviders: new Set<string>() } satisfies EnabledProvidersResult;
        }),
      ]);

      const stored = (flags.ai_models as Record<string, string> | undefined) ?? {};
      const selections = { ...MODEL_DEFAULTS, ...stored };

      return c.json({
        ...selections,
        selections,
        availableModels: providers.availableModels,
        openai_available: providers.enabledProviders.has("openai"),
      });
    } catch (error) {
      console.error("[GET /admin/ai-models] error:", error);
      return c.json({ error: "Failed to load AI model config." }, 500);
    }
  });

  route.post("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const parsed = aiModelsBodySchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid AI models payload." }, 400);
      }

      const flags = await getFeatureFlags();
      const existing = (flags.ai_models as Record<string, string> | undefined) ?? {};
      const updated = { ...existing, ...parsed.data };

      await updateFeatureFlags({ ai_models: updated });
      invalidateModelCache();
      await broadcastModelCacheInvalidation();

      return c.json(updated);
    } catch (error) {
      console.error("[POST /admin/ai-models] error:", error);
      return c.json({ error: "Failed to update AI model config." }, 500);
    }
  });

  return route;
}

const adminAiModelsRoute = createAdminAiModelsRoute();

export default adminAiModelsRoute;
