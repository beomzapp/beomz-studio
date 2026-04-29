import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";

import { updateFeatureFlagsInDb, listFeatureFlagsFromDb, type FeatureFlagsMap } from "../../lib/featureFlags.js";
import { invalidateModelCache, MODEL_DEFAULTS } from "../../lib/modelConfig.js";
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

interface AdminAiModelsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  getFeatureFlags?: () => Promise<FeatureFlagsMap>;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
  updateFeatureFlags?: (input: FeatureFlagsMap) => Promise<FeatureFlagsMap>;
}

export function createAdminAiModelsRoute(deps: AdminAiModelsRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const getFeatureFlags = deps.getFeatureFlags ?? listFeatureFlagsFromDb;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;
  const updateFeatureFlags = deps.updateFeatureFlags ?? updateFeatureFlagsInDb;

  route.get("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const flags = await getFeatureFlags();
      const stored = (flags.ai_models as Record<string, string> | undefined) ?? {};
      return c.json({ ...MODEL_DEFAULTS, ...stored });
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
