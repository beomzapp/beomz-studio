/**
 * Pre-build domain enrichment.
 *
 * For niche, regional, or industry-specific prompts, run a fast Haiku call
 * with web search to expand domain context before handing off to Sonnet.
 * This helps Sonnet generate far more relevant, terminology-aware apps for
 * prompts like "Australian building management system" instead of defaulting
 * to a generic admin panel.
 *
 * BEO-313: When the prompt references a named product/website (e.g.
 * "build an app like mybos.com"), targeted reference research is run first
 * and prepended as a "REFERENCE PRODUCT" block. Generic enrichment is skipped
 * in this case — the reference research is more valuable and fits the timeout.
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

// ── BEO-313: Brand/URL reference extraction ───────────────────────────────────

// Domains that appear naturally in text but aren't meaningful brand references
const REFERENCE_DOMAIN_EXCLUDES = new Set([
  "example.com",
  "test.com",
  "localhost",
  "app.com",
  "web.com",
  "site.com",
  "myapp.com",
]);

/**
 * Extract a named brand or domain that the user wants to reference/clone.
 *
 * Handles two cases:
 *   1. Keyword patterns: "like X", "similar to X", "inspired by X",
 *      "clone of X", "based on X", "modelled on X"
 *   2. Explicit URL in the prompt: mybos.com, notion.so, linear.app
 *
 * Returns the extracted brand string (e.g. "mybos.com", "Notion"), or null.
 */
export function extractBrandReference(prompt: string): string | null {
  // 1. Keyword patterns first — more intentional than a bare URL
  const keywordMatch = prompt.match(
    /\b(?:like|similar\s+to|inspired\s+by|clone\s+of|based\s+on|modell?ed\s+on)\s+([A-Za-z0-9][A-Za-z0-9.\-]{1,60})/i,
  );
  if (keywordMatch) {
    const brand = keywordMatch[1].replace(/[.,;!?'"]+$/, "").trim();
    if (brand.length >= 2) return brand;
  }

  // 2. Explicit URL pattern: word.tld (at least 2-char TLD, no path required)
  const urlMatch = prompt.match(
    /\b([a-zA-Z0-9][a-zA-Z0-9\-]{1,}(?:\.[a-zA-Z]{2,})+)\b/,
  );
  if (urlMatch) {
    const candidate = urlMatch[1].toLowerCase();
    if (!REFERENCE_DOMAIN_EXCLUDES.has(candidate)) {
      return urlMatch[1]; // return original casing
    }
  }

  return null;
}

// ── Prompt templates ──────────────────────────────────────────────────────────

const ENRICH_SYSTEM = `You are a product researcher. Given a software product description, identify the domain, key industry terminology, core workflows, typical user roles, and essential features. Be specific and practical.

Return a concise enrichment block (max 200 words) covering:
- Domain name and industry vertical
- Key concepts and terminology used in this domain
- Core user workflows (what users do day-to-day)
- Typical data entities (what gets created, tracked, managed)
- Industry-specific UI conventions or patterns
- Regulatory/compliance context if relevant

Focus on what makes this domain DIFFERENT from a generic app. Skip generic advice.`;

// BEO-317: Single search only — instructing Haiku to run 2 searches caused
// multi-round-trip tool use that reliably exceeded the 8s AbortController timeout.
// One well-targeted search completes in ~3-5s and provides sufficient context.
const REFERENCE_ENRICH_SYSTEM = `You are a product researcher. A user wants to build an app inspired by a specific product or website.

Use the web_search tool ONCE to research the reference product — search for "[product] features overview" to understand what it offers.

Return a concise reference analysis (max 150 words) covering:
- What this product does (core value proposition)
- Key features and capabilities
- Terminology and concepts specific to this product
- Primary user roles (who uses it and what they do)
- Key data entities the product manages
- Any industry-specific workflows or conventions

Focus on concrete, actionable product details that would help a developer build a similar app. Skip generic SaaS advice.`;

const ENRICH_TIMEOUT_MS = 8_000;

// ── Enrichment helpers ────────────────────────────────────────────────────────

function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Run targeted research on a named brand/product reference.
 * Returns the reference block string, or null if nothing useful came back.
 */
async function enrichWithReference(
  client: Anthropic,
  brandRef: string,
  signal: AbortSignal,
): Promise<string | null> {
  const message = await client.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: REFERENCE_ENRICH_SYSTEM,
      tools: [
        { type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Research "${brandRef} features overview" and describe what this product does, its key features, terminology, user roles, and data entities.`,
        },
      ],
    },
    { signal },
  );

  const text = extractText(message.content);
  return text || null;
}

/**
 * Run generic domain enrichment for niche/industry prompts.
 * Returns the enrichment block string, or null if nothing useful came back.
 */
async function enrichGeneric(
  client: Anthropic,
  userPrompt: string,
  signal: AbortSignal,
): Promise<string | null> {
  const message = await client.messages.create(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: ENRICH_SYSTEM,
      tools: [
        { type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Research this software product description and return domain context:\n<prompt>${userPrompt}</prompt>`,
        },
      ],
    },
    { signal },
  );

  const text = extractText(message.content);
  return text || null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enrich a user prompt with domain-specific context via a fast Haiku call.
 *
 * BEO-313: If the prompt references a named product/brand (e.g. "like mybos.com"),
 * targeted reference research is run and prepended as a REFERENCE PRODUCT block.
 * Otherwise, generic domain enrichment runs as before.
 *
 * Falls back to the original prompt on any error or timeout — never blocks the build.
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

  const brandRef = extractBrandReference(userPrompt);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey });

    if (brandRef) {
      // ── Named-product reference path (BEO-313) ────────────────────────────
      console.log(`[enrichment] brand reference detected: "${brandRef}" — running targeted research`);

      const referenceText = await enrichWithReference(client, brandRef, controller.signal);

      if (!referenceText) {
        console.log(`[enrichment] reference research returned no text — using original prompt`);
        return userPrompt;
      }

      console.log(`[enrichment] reference enrichment complete for: ${brandRef}`);

      // BEO-317: Prepend the reference block BEFORE the user prompt so Sonnet
      // encounters the product context at the start of the message, giving it
      // maximum weight over the original prompt text.
      return `--- REFERENCE PRODUCT: ${brandRef} ---
${referenceText}
--- END REFERENCE PRODUCT ---

${userPrompt}`;
    } else {
      // ── Generic domain enrichment path (existing behaviour) ───────────────
      const enrichmentText = await enrichGeneric(client, userPrompt, controller.signal);

      if (!enrichmentText) {
        console.log(`[enrichment] Haiku returned no text — using original prompt`);
        return userPrompt;
      }

      console.log(`[enrichment] enriched prompt for: ${userPrompt.slice(0, 50)}`);

      return `${userPrompt}

--- DOMAIN CONTEXT (researched) ---
${enrichmentText}
--- END DOMAIN CONTEXT ---`;
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`[enrichment] failed, using original prompt: ${reason}`);
    return userPrompt;
  } finally {
    clearTimeout(timeoutId);
  }
}
