/**
 * planPhases — BEO-332 Fixed 5-phase progressive enhancement structure
 *
 * Phase titles and purposes are ALWAYS the same 5 layers (Option D):
 *   1. Core shell & data model   — full scaffold, all pages, mock data
 *   2. Database integration      — wire real Supabase CRUD
 *   3. Advanced features         — domain-specific analytics, exports, etc.
 *   4. Polish & UX               — states, toasts, animations, validation
 *   5. Optimise                  — responsiveness, perf, a11y
 *
 * Haiku only generates the domain-specific description for each phase.
 * Falls back to the generic purpose string on any failure.
 */

import Anthropic from "@anthropic-ai/sdk";

import { apiConfig } from "../config.js";

export interface Phase {
  index: number;     // 1-based
  title: string;     // fixed — e.g. "Core shell & data model"
  description: string;
  focus: string[];   // key domain items for this phase
}

// ── Fixed phase structure ─────────────────────────────────────────────────────

const FIXED_PHASES: ReadonlyArray<{ title: string; fallback: string }> = [
  {
    title: "Core shell & data model",
    fallback: "Full app scaffold — complete UI, all pages, navigation, mock data. Build the entire app foundation.",
  },
  {
    title: "Database integration",
    fallback: "Replace all mock/hardcoded data with real Supabase queries. Wire up CRUD operations to the database.",
  },
  {
    title: "Advanced features",
    fallback: "Add domain-specific advanced functionality — analytics, reporting, bulk operations, exports, filters.",
  },
  {
    title: "Polish & UX",
    fallback: "Loading states, empty states, error handling, toast notifications, animations, form validation.",
  },
  {
    title: "Optimise",
    fallback: "Mobile responsiveness audit — fix layouts breaking below 768px, tablet breakpoints, touch-friendly tap targets (min 44px), performance optimisation, accessibility improvements (aria, keyboard nav, focus states).",
  },
];

// ── Haiku prompt — generates ONLY descriptions ────────────────────────────────

const DESCRIPTION_SYSTEM = `You write concise, domain-specific descriptions for 5 fixed build phases of a software project.

The 5 phases are always:
1. Core shell & data model — full UI scaffold, all pages, navigation, mock data
2. Database integration — replace mock data with real Supabase CRUD operations
3. Advanced features — domain-specific analytics, reporting, bulk ops, exports, filters
4. Polish & UX — loading/empty states, error handling, toasts, animations, form validation
5. Optimise — mobile responsiveness audit (fix layouts breaking below 768px), tablet breakpoints (sidebar/nav correct at 768px), touch-friendly interactions (tap targets min 44px), performance (lazy loading, memo on expensive components), accessibility (aria labels, keyboard navigation, focus states)

For the given app, write ONE concise sentence per phase describing what SPECIFICALLY will be built for THAT domain. Focus on domain content, not the generic phase purpose.

Return ONLY a JSON array of exactly 5 strings (one per phase, in order). No markdown, no explanation:
["phase 1 description", "phase 2 description", "phase 3 description", "phase 4 description", "phase 5 description"]`;

// ── Public API ────────────────────────────────────────────────────────────────

export async function planPhases(prompt: string): Promise<Phase[]> {
  let descriptions: string[] = [];

  try {
    const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: DESCRIPTION_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Write phase descriptions for this app: ${prompt}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (textBlock?.type === "text") {
      const raw = textBlock.text
        .trim()
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((d) => typeof d === "string")) {
        descriptions = parsed as string[];
      }
    }
  } catch (err) {
    console.warn("[planPhases] description generation failed (using fallbacks):", err instanceof Error ? err.message : String(err));
  }

  // Assemble fixed structure with domain descriptions (or fallbacks)
  const phases: Phase[] = FIXED_PHASES.map((p, i) => ({
    index: i + 1,
    title: p.title,
    description: descriptions[i]?.trim() || p.fallback,
    focus: [],
  }));

  console.log("[planPhases] planned", phases.length, "phases for prompt");
  return phases;
}
