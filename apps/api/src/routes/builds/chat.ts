import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  getImplementSuggestionDecision,
  normalisePlanningMessages,
} from "../../lib/chatMode.js";
import { anthropic } from "../plan/shared.js";

const buildsChatRoute = new Hono();

const CHAT_MODE_SYSTEM_PROMPT = "You are Beomz in planning mode. The user wants to think through an app before building. Ask focused questions to understand what the app does, who uses it, key features, any design preferences. Keep responses short — 2-4 sentences max. When you have enough to build, say you think you have enough and include a brief summary of what you'll build. Don't ask more than one question per message.";

const requestSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
  projectId: z.string().uuid().optional(),
});

buildsChatRoute.post("/", verifyPlatformJwt, loadOrgContext, async (c) => {
  const orgContext = c.get("orgContext") as OrgContext;
  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ details: parsed.error.flatten(), error: "Invalid chat request body." }, 400);
  }

  const { messages: rawMessages, projectId } = parsed.data;

  if (projectId) {
    const project = await orgContext.db.findProjectById(projectId);
    if (!project || project.org_id !== orgContext.org.id) {
      return c.json({ error: "Project not found." }, 404);
    }
  }

  const messages = normalisePlanningMessages(rawMessages);
  if (messages.length === 0) {
    return c.json({ error: "No conversational messages found." }, 400);
  }

  return streamSSE(c, async (sse) => {
    let nextEventId = 1;
    let assistantResponse = "";

    const writeEvent = async (event: string, payload: Record<string, unknown>) => {
      const id = String(nextEventId++);
      await sse.writeSSE({
        event,
        id,
        data: JSON.stringify({
          id,
          operation: "clarify_plan",
          timestamp: new Date().toISOString(),
          ...payload,
        }),
      });
    };

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: CHAT_MODE_SYSTEM_PROMPT,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta"
        && event.delta.type === "text_delta"
        && event.delta.text.length > 0
      ) {
        assistantResponse += event.delta.text;
        await writeEvent("chat_response", {
          type: "chat_response",
          delta: event.delta.text,
        });
      }
    }

    const decision = getImplementSuggestionDecision(messages, assistantResponse);
    if (decision.shouldEmit && decision.summary) {
      await writeEvent("implement_suggestion", {
        type: "implement_suggestion",
        summary: decision.summary,
      });
    }
  });
});

export default buildsChatRoute;
