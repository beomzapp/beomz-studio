/**
 * BEO-312 — Extract a feature list from an enriched prompt using Claude Haiku.
 * Used right after enrichPrompt() for complex builds to surface a feature
 * checklist the user can confirm before generation starts.
 *
 * Returns { features: string[] } — max 10 items, short human-readable labels.
 * Falls back to [] on any failure; callers treat an empty list as "skip scoping".
 */
import Anthropic from "@anthropic-ai/sdk";

import { apiConfig } from "../config.js";

const EXTRACT_TIMEOUT_MS = 6_000;

const SYSTEM_PROMPT = `You extract a feature list from an app description.

Rules:
- Return ONLY a JSON array of strings — no prose, no markdown, no explanation
- Maximum 10 features
- Each feature is a short, human-readable label (2-5 words)
- Prioritise the most important/distinct features
- Start with the core feature (dashboard, main view, etc.)
- Do NOT include generic features every app has (authentication, settings)
- If the prompt contains a REFERENCE PRODUCT section, extract features from it

Example output:
["Dashboard & overview", "Work orders", "Maintenance requests", "Residents & owners", "Amenity bookings", "Parcel tracking", "Document library", "Levy management"]`;

export async function extractFeatures(
  enrichedPrompt: string,
  originalPrompt: string,
): Promise<{ features: string[] }> {
  const apiKey = apiConfig.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { features: [] };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey });
    const userMessage = enrichedPrompt !== originalPrompt
      ? `Extract the feature list for this app:\n\n${enrichedPrompt}`
      : `Extract the feature list for this app:\n\n${originalPrompt}`;

    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal },
    );

    const raw = (response.content[0] as { type: string; text?: string })?.text?.trim() ?? "";

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;

    if (Array.isArray(parsed) && parsed.every((f) => typeof f === "string")) {
      const features = (parsed as string[]).slice(0, 10);
      console.log("[extractFeatures] extracted:", features.length, "features");
      return { features };
    }

    return { features: [] };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[extractFeatures] failed, returning empty list:", reason);
    return { features: [] };
  } finally {
    clearTimeout(timeoutId);
  }
}
