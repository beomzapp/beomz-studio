/**
 * POST /builds/summary
 * Streams a short post-build AI summary from the server.
 * Keeps ANTHROPIC_API_KEY on the server — no client-side key needed.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { anthropic } from "../plan/shared.js";

const buildsSummaryRoute = new Hono();

const requestSchema = z.object({
  userPrompt: z.string().trim().min(1).max(4000),
  buildInfo: z.string().trim().min(1).max(2000),
});

buildsSummaryRoute.post("/", verifyPlatformJwt, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request body." }, 400);
  }

  const { userPrompt, buildInfo } = parsed.data;

  return streamSSE(c, async (sse) => {
    await sse.writeSSE({ event: "open", data: "" });

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system:
        "You are Beomz, a friendly app builder assistant. The user asked you to build something and you just finished building it. Write a short, conversational summary (2-3 sentences) of what you built. Mention the key features you included. End by asking what they'd like to change. Do not use markdown formatting.",
      messages: [
        {
          role: "user",
          content: `User request: "${userPrompt}"\n\nBuild result: ${buildInfo}`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        await sse.writeSSE({ data: event.delta.text });
      }
    }

    await sse.writeSSE({ data: "[DONE]" });
  });
});

export default buildsSummaryRoute;
