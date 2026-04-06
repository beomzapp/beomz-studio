import { Hono } from "hono";
import { z } from "zod";

import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import { anthropic, PLAN_CLARIFY_MODEL } from "./shared.js";

const analyzeRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      }),
    )
    .optional(),
});

const ANALYZE_SYSTEM_PROMPT = `You are a planning assistant for Beomz, an AI app builder.

The user has described what they want to build. Analyze their prompt (and any conversation history) to determine if you have enough context to create a build plan.

Return ONLY valid JSON with these fields:
{
  "confidence": <number 0-1>,
  "summary": <string[] of 3-5 bullet points, or null if confidence < 0.85>,
  "nextQuestion": <string or null — a single clarifying question if confidence < 0.85>,
  "options": <string[] of 3-4 short answer options for the question, or null>,
  "aiMessage": <string — a conversational 1-2 sentence message to the user>
}

Rules:
1. Set confidence based on how clear the user's intent is. If they specify the type of app, key features, and target audience, confidence should be >= 0.85.
2. If confidence >= 0.85, provide a summary array of 3-5 concise bullet points describing what will be built. Set nextQuestion to null.
3. If confidence < 0.85, ask the single most important clarifying question. Provide 3-4 short answer options. Set summary to null.
4. The aiMessage should be friendly and conversational. If showing a summary, lead with "Hey! So you want to build [restatement]." If asking a question, lead with "Hey! Love the idea —".
5. Keep answer options to 3-6 words each.
6. After 2-4 questions in the history, you should have enough context. Increase confidence.`;

const planAnalyzeRoute = new Hono();

planAnalyzeRoute.post("/", verifyPlatformJwt, async (c) => {
  const requestBody = await c.req.json().catch(() => null);
  const parsed = analyzeRequestSchema.safeParse(requestBody);

  if (!parsed.success) {
    return c.json(
      {
        details: parsed.error.flatten(),
        error: "Invalid analyze request body.",
      },
      400,
    );
  }

  const { prompt, history } = parsed.data;

  try {
    const messages = [
      ...(history ?? []).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
    ];

    // If no history, add the prompt as the first user message
    if (messages.length === 0) {
      messages.push({ role: "user" as const, content: `Build: ${prompt}` });
    }

    const response = await anthropic.messages.create({
      model: PLAN_CLARIFY_MODEL,
      max_tokens: 1024,
      system: ANALYZE_SYSTEM_PROMPT,
      messages,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return c.json(
        { error: "Failed to parse AI response." },
        500,
      );
    }

    const result = JSON.parse(jsonMatch[0]);
    return c.json(result);
  } catch (err) {
    console.error("Plan analyze error:", err);
    return c.json(
      { error: "Failed to analyze prompt." },
      500,
    );
  }
});

export default planAnalyzeRoute;
