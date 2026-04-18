import { Hono } from "hono";
import { z } from "zod";

import { summariseChatThread } from "../../lib/summariseChatThread.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";

const buildsSummariseChatRoute = new Hono();

const requestSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
  projectId: z.string().uuid().optional(),
});

buildsSummariseChatRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ details: parsed.error.flatten(), error: "Invalid summarise-chat request body." }, 400);
  }

  const { messages, projectId } = parsed.data;

  if (projectId) {
    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found." }, 404);
    }
  }

  try {
    return c.json(await summariseChatThread(messages));
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Failed to summarise chat thread.",
    }, 500);
  }
});

export default buildsSummariseChatRoute;
