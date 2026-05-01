import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

import { abortActiveBuild } from "../../lib/activeBuilds.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

interface BuildsCancelRouteDeps {
  authMiddleware?: MiddlewareHandler;
  loadOrgContextMiddleware?: MiddlewareHandler;
}

export function createBuildsCancelRoute(deps: BuildsCancelRouteDeps = {}) {
  const route = new Hono();
  const authMiddleware = deps.authMiddleware ?? verifyPlatformJwt;
  const loadOrgContextMiddleware = deps.loadOrgContextMiddleware ?? loadOrgContext;

  route.post("/", authMiddleware, loadOrgContextMiddleware, async (c) => {
    const orgContext = c.get("orgContext") as OrgContext;
    const buildId = c.req.param("id");

    if (!buildId) {
      return c.json({ error: "Build id is required." }, 400);
    }

    const generationRow = await orgContext.db.findGenerationById(buildId);
    if (!generationRow) {
      return c.json({ error: "Build not found." }, 404);
    }

    const projectRow = await orgContext.db.findProjectById(generationRow.project_id);
    if (!projectRow || projectRow.org_id !== orgContext.org.id) {
      return c.json({ error: "Build not found." }, 404);
    }

    if (
      generationRow.status === "completed"
      || generationRow.status === "failed"
      || generationRow.status === "cancelled"
      || generationRow.status === "timed_out"
    ) {
      return c.json({ error: "Build is no longer active." }, 409);
    }

    if (!abortActiveBuild(buildId, "cancelled_by_user")) {
      return c.json({ error: "Build is not running on this worker." }, 409);
    }

    return c.json({ ok: true, status: "cancelling" }, 202);
  });

  return route;
}

const buildsCancelRoute = createBuildsCancelRoute();

export default buildsCancelRoute;
