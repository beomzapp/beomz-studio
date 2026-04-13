/**
 * Pre-build domain enrichment.
 *
 * For niche, regional, or industry-specific prompts, run a fast Haiku call
 * with web search to expand domain context before handing off to Sonnet.
 * This helps Sonnet generate far more relevant, terminology-aware apps for
 * prompts like "Australian building management system" instead of defaulting
 * to a generic admin panel.
 *
 * enrichPrompt() MUST NEVER throw — any failure returns the original prompt.
 * Maximum enrichment time: 8 seconds (then times out and returns original).
 */

import Anthropic from "@anthropic-ai/sdk";

import { apiConfig } from "../config.js";

// ── Generic prompt detection ──────────────────────────────────────────────────
// Prompts that match common generic patterns don't need domain research.
// For everything else (especially niche/regional/professional domains), enrich.

const GENERIC_PATTERNS = [
  /\b(todo|to-do|to do|task list)\b/i,
  /\b(note|notes|note-taking|notetaking)\b/i,
  /\bcalculator?\b/i,
  /\btimer?\b/i,
  /\bweather\b/i,
  /\bchat\b/i,
  /\bblog\b/i,
  /\bportfolio\b/i,
  /\bexpense tracker\b/i,
  /\bhabit tracker\b/i,
  /\brecipe\b/i,
  /\bcountdown\b/i,
  /\bflashcard\b/i,
  /\bpomodoro\b/i,
];

/** Returns true when the prompt is worth enriching. */
export function isNicheOrSpecificPrompt(prompt: string): boolean {
  const words = prompt.trim().split(/\s+/);
  // Too short to be niche
  if (words.length <= 4) return false;
  // Known generic apps — fast path out
  if (GENERIC_PATTERNS.some((re) => re.test(prompt))) return false;
  // Everything else: multi-word, non-generic → likely domain-specific
  return true;
}

// ── Enrichment call ───────────────────────────────────────────────────────────

const ENRICH_SYSTEM = `You are a product researcher. Given a software product description, identify the domain, key industry terminology, core workflows, typical user roles, and essential features. Be specific and practical.

Return a concise enrichment block (max 200 words) covering:
- Domain name and industry vertical
- Key concepts and terminology used in this domain
- Core user workflows (what users do day-to-day)
- Typical data entities (what gets created, tracked, managed)
- Industry-specific UI conventions or patterns
- Regulatory/compliance context if relevant

Focus on what makes this domain DIFFERENT from a generic app. Skip generic advice.`;

const ENRICH_TIMEOUT_MS = 8_000;

/**
 * Enrich a user prompt with domain-specific context via a fast Haiku call.
 *
 * Uses Anthropic's built-in web_search tool so Haiku can pull fresh
 * industry-specific information. Falls back to the original prompt on any
 * error or timeout — never blocks the build.
 */
export async function enrichPrompt(userPrompt: string): Promise<string> {
  if (!isNicheOrSpecificPrompt(userPrompt)) {
    console.log(`[enrichment] skipped (generic prompt): ${userPrompt.slice(0, 50)}`);
    return userPrompt;
  }

  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[enrichment] ANTHROPIC_API_KEY not set — skipping enrichment");
    return userPrompt;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: ENRICH_SYSTEM,
        tools: [
          // Anthropic built-in web search — handled server-side by Anthropic
          { type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool,
        ],
        messages: [
          {
            role: "user",
            content: `Research this software product description and return domain context:\n<prompt>${userPrompt}</prompt>`,
          },
        ],
      },
      { signal: controller.signal },
    );

    // Extract all text blocks from the response (web search results may
    // interleave with text; we only want the final text synthesis).
    const textBlocks = message.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    );
    const enrichmentText = textBlocks.map((b) => b.text).join("\n").trim();

    if (!enrichmentText) {
      console.log(`[enrichment] Haiku returned no text — using original prompt`);
      return userPrompt;
    }

    console.log(`[enrichment] enriched prompt for: ${userPrompt.slice(0, 50)}`);

    return `${userPrompt}

--- DOMAIN CONTEXT (researched) ---
${enrichmentText}
--- END DOMAIN CONTEXT ---`;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`[enrichment] failed, using original prompt: ${reason}`);
    return userPrompt;
  } finally {
    clearTimeout(timeoutId);
  }
}
