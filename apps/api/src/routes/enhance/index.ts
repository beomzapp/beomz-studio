import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";

const enhanceRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
});

const ENHANCE_SYSTEM_PROMPT =
  "You are a prompt enhancer for an AI app builder. "
  + "Expand the user's short prompt into a detailed, specific build prompt under 150 words. "
  + "Add relevant features, pages, UI patterns, and data entities implied by the prompt. "
  + "Return the enhanced prompt as clean plain text only. "
  + "No markdown formatting, no asterisks, no bullet points, no headers, no numbered lists. "
  + "Write it as natural flowing sentences separated by commas and periods.";

const enhanceRoute = new Hono();

enhanceRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = enhanceRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "prompt is required (max 2000 chars)" }, 400);
  }

  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: ENHANCE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: parsed.data.prompt }],
    });

    const textBlock = message.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    );

    if (!textBlock) {
      return c.json({ error: "No text response from model." }, 502);
    }

    return c.json({ enhancedPrompt: textBlock.text.trim() });
  } catch (err) {
    console.error("[enhance] Anthropic call failed:", err instanceof Error ? err.message : err);
    return c.json({ error: "Enhancement failed — please try again." }, 502);
  }
});

export default enhanceRoute;
