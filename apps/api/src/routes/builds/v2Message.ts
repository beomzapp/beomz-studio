import * as crypto from "node:crypto";
import type { ServerResponse } from "node:http";

import type { HttpBindings } from "@hono/node-server";
import type { ChatV2Event } from "@beomz-studio/contracts";
import { Hono } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";

type Response = ServerResponse;

const requestSchema = z.object({
  attachments: z.array(z.object({
    imageUrl: z.string().optional(),
  })).optional(),
  projectId: z.string().min(1),
  prompt: z.string().min(1),
});

function emit(res: Response, event: ChatV2Event): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

const buildsV2MessageRoute = new Hono();

buildsV2MessageRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  if (apiConfig.USE_CHAT_PANEL_V2 !== "true") {
    return c.json({ error: "Not found." }, 404);
  }

  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json({ details: parsedBody.error.flatten(), error: "Invalid v2 message request body." }, 400);
  }

  const res = (c.env as Partial<HttpBindings>).outgoing;
  if (!res) {
    return c.json({ error: "Streaming unavailable." }, 500);
  }

  const { projectId } = parsedBody.data;

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const turnId = crypto.randomUUID();
    const messageId = crypto.randomUUID();

    console.log("[v2/message] turn started", { projectId, turnId, kind: "stub" });

    emit(res, {
      type: "turn_started",
      turnId,
      userMessageId: messageId,
      kind: "initial_build",
      projectContext: {
        isFirstBuild: true,
        hasExistingFiles: false,
        fileCount: 0,
      },
    });
    emit(res, { type: "state", phase: "classifying" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    emit(res, { type: "state", phase: "done" });
    emit(res, { type: "turn_complete", turnId });
    res.end();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    try {
      emit(res, { type: "error", code: "internal", message: err.message, retryable: true });
    } catch {
      // Ignore secondary stream errors while attempting to surface the primary failure.
    }

    res.end();
  }

  return new globalThis.Response(null, {
    headers: {
      "x-hono-already-sent": "true",
    },
  });
});

export default buildsV2MessageRoute;
