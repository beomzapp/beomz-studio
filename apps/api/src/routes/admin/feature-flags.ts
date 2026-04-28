import { Hono, type MiddlewareHandler } from "hono";

import {
  listFeatureFlagsFromDb,
  parseFeatureFlagsPatch,
  type FeatureFlagsMap,
  updateFeatureFlagsInDb,
} from "../../lib/featureFlags.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

interface AdminFeatureFlagsRouteDeps {
  authMiddleware?: MiddlewareHandler;
  getFeatureFlags?: () => Promise<FeatureFlagsMap>;
  loadOrgContextMiddleware?: MiddlewareHandler;
  requireAdminMiddleware?: MiddlewareHandler;
  updateFeatureFlags?: (input: FeatureFlagsMap) => Promise<FeatureFlagsMap>;
}

export function createAdminFeatureFlagsRoute(deps: AdminFeatureFlagsRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const getFeatureFlags = deps.getFeatureFlags ?? listFeatureFlagsFromDb;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;
  const requireAdminMiddleware = deps.requireAdminMiddleware ?? requireAdmin;
  const updateFeatureFlags = deps.updateFeatureFlags ?? updateFeatureFlagsInDb;

  route.get("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const flags = await getFeatureFlags();
      return c.json(flags);
    } catch (error) {
      console.error("[GET /admin/feature-flags] error:", error);
      return c.json({ error: "Failed to load feature flags." }, 500);
    }
  });

  route.patch("/", authMiddleware, loadOrgContextMiddleware, requireAdminMiddleware, async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const parsed = parseFeatureFlagsPatch(body);
      if (!parsed.success) {
        return c.json(parsed.error, 400);
      }

      const flags = await updateFeatureFlags(parsed.data);
      return c.json(flags);
    } catch (error) {
      console.error("[PATCH /admin/feature-flags] error:", error);
      return c.json({ error: "Failed to update feature flags." }, 500);
    }
  });

  return route;
}

const adminFeatureFlagsRoute = createAdminFeatureFlagsRoute();

export default adminFeatureFlagsRoute;
