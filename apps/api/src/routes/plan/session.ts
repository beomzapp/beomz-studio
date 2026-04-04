import type {
  CreatePlanSessionResponse,
  GetLatestActivePlanSessionResponse,
  GetPlanSessionResponse,
} from "@beomz-studio/contracts";
import { Hono } from "hono";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  createPlanSessionRequestSchema,
  mapPlanSessionRowToPlanSession,
  updatePlanSessionRequestSchema,
} from "./shared.js";

const planSessionRoute = new Hono();

planSessionRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = createPlanSessionRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json(
      {
        details: parsedBody.error.flatten(),
        error: "Invalid plan session request body.",
      },
      400,
    );
  }

  const row = await orgContext.db.createPlanSession({
    prompt: parsedBody.data.prompt.trim(),
    user_id: orgContext.user.id,
  });

  const response: CreatePlanSessionResponse = { sessionId: row.id };
  return c.json(response, 201);
});

planSessionRoute.get("/latest/active", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const row = await orgContext.db.findLatestActivePlanSessionByUserId(orgContext.user.id);
  const response: GetLatestActivePlanSessionResponse = {
    session: row ? mapPlanSessionRowToPlanSession(row) : null,
  };

  return c.json(response);
});

planSessionRoute.get("/:id", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const id = c.req.param("id");
  const row = await orgContext.db.findPlanSessionById(id);

  if (!row || row.user_id !== orgContext.user.id) {
    return c.json({ error: "Plan session not found." }, 404);
  }

  const response: GetPlanSessionResponse = {
    session: mapPlanSessionRowToPlanSession(row),
  };

  return c.json(response);
});

planSessionRoute.patch("/:id", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const id = c.req.param("id");
  const existing = await orgContext.db.findPlanSessionById(id);

  if (!existing || existing.user_id !== orgContext.user.id) {
    return c.json({ error: "Plan session not found." }, 404);
  }

  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = updatePlanSessionRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json(
      {
        details: parsedBody.error.flatten(),
        error: "Invalid plan session patch body.",
      },
      400,
    );
  }

  const row = await orgContext.db.updatePlanSession(id, {
    answers: parsedBody.data.answers,
    phase: parsedBody.data.phase,
    questions: parsedBody.data.questions,
    steps: parsedBody.data.steps,
    summary: parsedBody.data.summary,
  });

  const response: GetPlanSessionResponse = {
    session: mapPlanSessionRowToPlanSession(row),
  };

  return c.json(response);
});

export default planSessionRoute;
