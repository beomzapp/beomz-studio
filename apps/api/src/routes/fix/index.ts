import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { z } from "zod";

import { apiConfig } from "../../config.js";

const fixRequestSchema = z.object({
  buildId: z.string().min(1),
  filePath: z.string().min(1),
  errorMessage: z.string().min(1),
  fileContent: z.string().min(1),
});

const FIX_SYSTEM_PROMPT =
  "You are a JSX/React syntax fixer. Fix the syntax error in the given React file. "
  + "Return ONLY the complete fixed file content — no markdown fences, no explanation, no extra text. "
  + "Common fixes: replace backslash-escaped quotes in JSX attributes with &quot; or single quotes, "
  + "fix unclosed tags, fix mismatched brackets, fix invalid JSX expressions.";

const fixRoute = new Hono();

fixRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = fixRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Missing required fields: buildId, filePath, errorMessage, fileContent" },
      400,
    );
  }

  const { filePath, errorMessage, fileContent } = parsed.data;

  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: FIX_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Fix this JSX syntax error.\n\nFile: ${filePath}\nError: ${errorMessage}\n\nFile content:\n${fileContent}`,
        },
      ],
    });

    const textBlock = message.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    );

    if (!textBlock) {
      return c.json({ error: "No response from model." }, 502);
    }

    // Strip markdown fences if the model wraps the output
    let fixed = textBlock.text.trim();
    if (fixed.startsWith("```")) {
      fixed = fixed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    }

    return c.json({ fixedContent: fixed });
  } catch (err) {
    console.error("[fix] Anthropic call failed:", err instanceof Error ? err.message : err);
    return c.json({ error: "Fix failed — please try again." }, 502);
  }
});

export default fixRoute;
