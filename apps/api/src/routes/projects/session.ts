import { createSupabaseSessionStore } from "@beomz-studio/engine";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  buildInitialBuildOutput,
  mapGenerationRowToBuildPayload,
  mapProjectRowToProject,
} from "../builds/shared.js";

const projectSessionRoute = new Hono();

projectSessionRoute.get("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const projectId = c.req.param("id");

  if (!projectId) {
    return c.json({ error: "Project id is required." }, 400);
  }

  const projectRow = await orgContext.db.findProjectById(projectId);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found." }, 404);
  }

  const generationRow = await orgContext.db.findLatestGenerationByProjectId(projectId);

  if (!generationRow) {
    return c.json({
      build: null,
      project: mapProjectRowToProject(projectRow),
      result: null,
      session: null,
    });
  }

  const sessionStore = createSupabaseSessionStore({
    db: orgContext.db,
  });
  const session = await sessionStore.resume(generationRow.id);

  return c.json({
    build: mapGenerationRowToBuildPayload(generationRow),
    project: mapProjectRowToProject(projectRow),
    result: buildInitialBuildOutput(generationRow),
    session: {
      messages: session.messages,
      parentId: session.parentId ?? null,
      remainingCreditsUsd:
        mapGenerationRowToBuildPayload(generationRow).remainingCreditsUsd
        ?? orgContext.org.credits_balance,
      sessionId: session.sessionId,
      snapshot: session.snapshot,
      totalCostUsd: generationRow.total_cost_usd,
    },
  });
});

export default projectSessionRoute;
