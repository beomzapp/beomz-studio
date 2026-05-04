import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { apiConfig } from "../../config.js";
import type { OrgContext } from "../../types.js";
import {
  buildInitialBuildOutput,
  mapGenerationRowToBuild,
  mapProjectRowToProject,
  readBuildTraceMetadata,
} from "./shared.js";

function isChatV2PilotOrg(orgId: string): boolean {
  const ids = apiConfig.CHAT_PANEL_V2_PILOT_ORG_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(orgId);
}

const buildsStatusRoute = new Hono();

buildsStatusRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
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

  const trace = readBuildTraceMetadata(generationRow);

  return c.json({
    build: mapGenerationRowToBuild(generationRow),
    project: mapProjectRowToProject(projectRow),
    result: buildInitialBuildOutput(generationRow),
    trace,
    features: { chatV2: isChatV2PilotOrg(orgContext.org.id) },
  });
});

export default buildsStatusRoute;
