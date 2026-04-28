import { Hono } from "hono";

import {
  getModulesFeatureFlagsFromDb,
  type ModuleFeatureFlags,
} from "../lib/featureFlags.js";

interface FeatureFlagsRouteDeps {
  getModulesFeatureFlags?: () => Promise<ModuleFeatureFlags>;
}

export function createFeatureFlagsRoute(deps: FeatureFlagsRouteDeps = {}) {
  const route = new Hono();
  const getModulesFeatureFlags = deps.getModulesFeatureFlags ?? getModulesFeatureFlagsFromDb;

  route.get("/", async (c) => {
    try {
      const flags = await getModulesFeatureFlags();
      return c.json(flags);
    } catch (error) {
      console.error("[GET /feature-flags] error:", error);
      return c.json({ error: "Failed to load feature flags." }, 500);
    }
  });

  return route;
}

const featureFlagsRoute = createFeatureFlagsRoute();

export default featureFlagsRoute;
