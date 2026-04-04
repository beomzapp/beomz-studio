import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import {
  anthropic,
  CLARIFY_SYSTEM_PROMPT,
  PLAN_CLARIFY_MAX_TOKENS,
  PLAN_CLARIFY_MODEL,
  planClarifyRequestSchema,
} from "./shared.js";

const planClarifyRoute = new Hono();

planClarifyRoute.post("/", verifyPlatformJwt, async (c) => {
  const requestBody = await c.req.json().catch(() => null);
  const parsedBody = planClarifyRequestSchema.safeParse(requestBody);

  if (!parsedBody.success) {
    return c.json(
      {
        details: parsedBody.error.flatten(),
        error: "Invalid plan clarify request body.",
      },
      400,
    );
  }

  const prompt = parsedBody.data.prompt.trim();

  return streamSSE(c, async (sse) => {
    // Flush an immediate frame so proxies/load balancers see activity
    // quickly even if the model request experiences a cold-start delay.
    await sse.writeSSE({ event: "open", data: "" });

    const stream = anthropic.messages.stream({
      model: PLAN_CLARIFY_MODEL,
      max_tokens: PLAN_CLARIFY_MAX_TOKENS,
      system: CLARIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Build: ${prompt}` }],
    });

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

export default planClarifyRoute;
