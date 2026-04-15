/**
 * BEO-312 — Classify a user prompt as conversational, simple_build, or
 * complex_build using Claude Haiku with a 4 s timeout.
 *
 * Falls back to 'simple_build' on any failure so no build is ever blocked.
 */
import Anthropic from "@anthropic-ai/sdk";

import { apiConfig } from "../config.js";

export type IntentType = "conversational" | "simple_build" | "complex_build";

const CLASSIFY_TIMEOUT_MS = 4_000;

const SYSTEM_PROMPT = `You classify user prompts into exactly one of three categories.

CONVERSATIONAL — the message is a question, vague exploration, or request for ideas with no clear build action:
- "What else can we add?"
- "Any ideas for features?"
- "What should we build next?"
- "Thoughts on improving the UI?"
- "What do you suggest?"
- Contains a question mark with no clear build subject
- "Can you help me think about..." / "What are the options..."

SIMPLE_BUILD — a single, clear build instruction (one feature, one fix, one change):
- "Add a login page"
- "Fix the navigation bar"
- "Change the primary colour to blue"
- "Add a dark mode toggle"
- Single verb + noun, no more than 1-2 features implied

COMPLEX_BUILD — multi-feature app, product clone, brand reference, or 3+ features implied:
- Any prompt mentioning a brand/domain name (mybos.com, notion.so, linear.app)
- "Build a building management system"
- "Create a full CRM with contacts, deals, and pipeline"
- "Build something like Airbnb"
- 3 or more distinct features implied
- Words: "platform", "system", "dashboard", "suite", "full app", "complete"

Reply with ONLY one word — the category name: conversational, simple_build, or complex_build.`;

export async function classifyIntent(prompt: string): Promise<{ intent: IntentType }> {
  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { intent: "simple_build" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: controller.signal },
    );

    const raw = (response.content[0] as { type: string; text?: string })?.text?.trim().toLowerCase() ?? "";

    if (raw === "conversational") return { intent: "conversational" };
    if (raw === "complex_build") return { intent: "complex_build" };
    return { intent: "simple_build" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[classifyIntent] failed, defaulting to simple_build:", reason);
    return { intent: "simple_build" };
  } finally {
    clearTimeout(timeoutId);
  }
}
