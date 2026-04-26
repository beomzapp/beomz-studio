import { Hono } from "hono";

import { loadOrgContext } from "../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../types.js";

const activityRoute = new Hono();

function buildActivityLabel(projectName: string, eventType: string | null): string {
  switch (eventType) {
    case "iteration_complete":
      return `${projectName} — updated`;
    case "published":
      return `${projectName} published`;
    case "build_complete":
    default:
      return `${projectName} — new build`;
  }
}

activityRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  try {
    const orgContext = c.get("orgContext") as OrgContext;
    const limitParam = Number.parseInt(c.req.query("limit") ?? "3", 10);
    const limit = Number.isFinite(limitParam) ? Math.min(20, Math.max(1, limitParam)) : 3;
    const rows = await orgContext.db.listRecentActivityByOrgId(orgContext.org.id, limit);

    const events = rows.map((row) => {
      const type = row.event_type ?? "build_complete";
      const label = buildActivityLabel(row.project_name, row.event_type);

      return {
        appName: row.project_name,
        createdAt: row.created_at,
        description: label,
        id: row.id,
        label,
        projectId: row.project_id,
        projectName: row.project_name,
        type,
      };
    });

    return c.json({ activity: events, events });
  } catch (error) {
    console.error("[GET /activity] error:", error);
    return c.json({ error: "Failed to load activity." }, 500);
  }
});

export default activityRoute;
