/**
 * planPhases — BEO-197 Phased Build System
 *
 * Uses claude-haiku-4-5-20251001 to decompose a complex prompt into 3-5
 * independently-shippable build phases. Returns empty array on any failure
 * so the caller can gracefully fall back to single-phase mode.
 */

import Anthropic from "@anthropic-ai/sdk";

import { apiConfig } from "../config.js";

export interface Phase {
  index: number;     // 1-based
  title: string;     // e.g. "Core shell + navigation"
  description: string;
  focus: string[];   // key components / features
}

const PHASE_PLANNER_SYSTEM = `You are a software architect. Given a complex app description, break it into 3-5 logical build phases. Each phase should be independently shippable and build on the previous.

Rules:
- Phase 1 always: core layout, navigation, data model, main entities
- Final phase always: any public-facing or reporting features
- Each phase: 1-3 major features, not more
- Keep phases focused — don't try to do everything at once

Return ONLY valid JSON array, no markdown, no explanation:
[
  {
    "index": 1,
    "title": "Core shell + data model",
    "description": "Main layout, navigation, and primary data entities",
    "focus": ["Navigation", "Dashboard", "Primary data model"]
  }
]`;

export async function planPhases(prompt: string): Promise<Phase[]> {
  try {
    const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: PHASE_PLANNER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Plan the build phases for this app: ${prompt}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.warn("[planPhases] no text block in response");
      return [];
    }

    const raw = textBlock.text.trim();
    const phases = JSON.parse(raw) as unknown;

    if (!Array.isArray(phases)) {
      console.warn("[planPhases] response is not an array");
      return [];
    }

    const validated = phases
      .filter(
        (p): p is Phase =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as Phase).index === "number" &&
          typeof (p as Phase).title === "string" &&
          typeof (p as Phase).description === "string" &&
          Array.isArray((p as Phase).focus),
      )
      .map((p) => ({
        index: p.index,
        title: p.title,
        description: p.description,
        focus: (p.focus as unknown[]).filter((f): f is string => typeof f === "string"),
      }));

    console.log("[planPhases] planned", validated.length, "phases for prompt");
    return validated;
  } catch (err) {
    console.warn("[planPhases] failed (non-fatal):", err instanceof Error ? err.message : String(err));
    return [];
  }
}
