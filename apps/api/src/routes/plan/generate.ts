import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import {
  anthropic,
  GENERATE_SYSTEM_PROMPT,
  PLAN_GENERATE_MAX_TOKENS,
  PLAN_GENERATE_MODEL,
  planGenerateRequestSchema,
} from "./shared.js";

const planGenerateRoute = new Hono();

planGenerateRoute.post("/", verifyPlatformJwt, async (c) => {
  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = planGenerateRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json(
      {
        details: parsedBody.error.flatten(),
        error: "Invalid plan generation request body.",
      },
      400,
    );
  }

  const prompt = parsedBody.data.prompt.trim();
  const answersText = parsedBody.data.answers
    .map(({ questionId, answer }) => `${questionId}: ${answer}`)
    .join("\n");

  const stream = anthropic.messages.stream({
    model: PLAN_GENERATE_MODEL,
    max_tokens: PLAN_GENERATE_MAX_TOKENS,
    system: GENERATE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Build: ${prompt}\n\nAnswers:\n${answersText}`,
      },
    ],
  });

  return streamSSE(c, async (sse) => {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta"
        && event.delta.type === "text_delta"
      ) {
        await sse.writeSSE({ data: event.delta.text });
      }
    }

    await sse.writeSSE({ data: "[DONE]" });
  });
});

export default planGenerateRoute;
