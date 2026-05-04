import * as crypto from "node:crypto";
import type { ServerResponse } from "node:http";

import type { HttpBindings } from "@hono/node-server";
import type { ChatV2Event } from "@beomz-studio/contracts";
import { Hono } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";
import { classifyTurn } from "../../lib/classifyTurn.js";
import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { anthropic } from "../plan/shared.js";
import type { OrgContext } from "../../types.js";
import { filterBlockedGeneratedFiles } from "./generate.js";

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

  const orgContext = c.get("orgContext") as OrgContext;
  const { projectId, prompt } = parsedBody.data;

  const projectRow = await orgContext.db.findProjectById(projectId);
  if (!projectRow || projectRow.org_id !== orgContext.org.id) {
    return c.json({ error: "Project not found." }, 404);
  }

  const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectRow.id);
  const existingFiles = latestGeneration?.files
    ? filterBlockedGeneratedFiles([...latestGeneration.files])
    : [];
  const hasExistingFiles = existingFiles.length > 0;
  const fileCount = existingFiles.length;
  const result = await classifyTurn({ prompt, hasExistingFiles, fileCount });

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const turnId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();

    console.log("[v2/message] turn started", { projectId, turnId, kind: result.kind });
    console.log("[telemetry] turn classified", {
      projectId,
      turnId,
      kind: result.kind,
      confidence: result.confidence,
      reason: result.reason,
    });

    emit(res, {
      type: "turn_started",
      turnId,
      userMessageId: messageId,
      kind: result.kind,
      projectContext: {
        isFirstBuild: !hasExistingFiles,
        hasExistingFiles,
        fileCount,
      },
    });
    emit(res, { type: "state", phase: "classifying" });

    if (result.kind === "question") {
      emit(res, { type: "state", phase: "thinking" });
      const stream = anthropic.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: "You are Beomz, a friendly AI coding assistant. Answer the user's question about their web app concisely. If they describe a change they want, explain what you would do briefly — don't implement it yet.",
        messages: [{ role: "user", content: prompt }],
      });
      stream.on("error", () => {});
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          emit(res, { type: "text_delta", messageId: assistantMessageId, delta: event.delta.text });
        }
      }
      await stream.finalMessage();
    } else if (result.kind === "iteration" || result.kind === "redesign") {
      emit(res, { type: "state", phase: "thinking" });
      emit(res, { type: "state", phase: "building" });
      // TODO P2.5: delegate to exported callModelIterate helper in generate.ts
      emit(res, { type: "text_delta", messageId: assistantMessageId, delta: "On it — applying your changes." });
    } else {
      // initial_build
      emit(res, { type: "state", phase: "thinking" });
      emit(res, { type: "state", phase: "planning" });
      // TODO P2.5: delegate to runBuildInBackground in generate.ts
    }

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
