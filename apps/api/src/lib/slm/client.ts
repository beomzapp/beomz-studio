/**
 * Beomz Studio SLM client — API side.
 *
 * Calls the Python FastAPI sidecar at SLM_BASE_URL (defaults to
 * http://127.0.0.1:8001) for semantic template matching and palette
 * classification.  Every function gracefully falls back to the existing
 * keyword heuristics when the sidecar is unreachable or returns an error.
 */

import type { InitialBuildPlan, TemplateId, TemplateSelectionResult } from "@beomz-studio/contracts";
import { listTemplateDefinitions, listPrebuiltTemplates } from "@beomz-studio/templates";
import { selectInitialBuildTemplate } from "@beomz-studio/temporal-worker";

const SLM_BASE_URL = (process.env.SLM_BASE_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
const SLM_TIMEOUT_MS = 4_000;

// ─── Palette keyword fallback ──────────────────────────────────────────────

const PALETTE_KEYWORD_MAP: Array<{ paletteId: string; keywords: readonly string[] }> = [
  { paletteId: "crypto-dark", keywords: ["crypto", "web3", "blockchain", "token", "defi", "wallet", "nft"] },
  { paletteId: "law-navy", keywords: ["law", "legal", "attorney", "lawyer", "compliance", "firm"] },
  { paletteId: "finance-green", keywords: ["finance", "money", "budget", "expense", "bookkeeping", "invoice", "accounting", "tax"] },
  { paletteId: "medical-blue", keywords: ["medical", "clinic", "doctor", "hospital", "patient", "therapy", "dental", "clinical"] },
  { paletteId: "energy-red", keywords: ["workout", "gym", "training", "sport", "sports", "athlete", "running", "performance"] },
  { paletteId: "health-teal", keywords: ["health", "fitness", "wellness", "habit", "nutrition", "mindfulness", "yoga"] },
  { paletteId: "warm-amber", keywords: ["food", "restaurant", "recipe", "cook", "cafe", "coffee", "dining", "bakery", "menu"] },
  { paletteId: "kids-yellow", keywords: ["kids", "children", "school", "classroom", "teacher", "toddler", "preschool"] },
  { paletteId: "midnight-indigo", keywords: ["study", "planner", "focus", "notes", "productivity", "todo", "task", "calendar"] },
  { paletteId: "retail-coral", keywords: ["retail", "shop", "store", "shopping", "deal", "sale", "checkout"] },
  { paletteId: "rose-pink", keywords: ["beauty", "fashion", "skincare", "cosmetic", "lifestyle", "makeup"] },
  { paletteId: "ocean-cyan", keywords: ["travel", "water", "ocean", "beach", "hotel", "flight", "cruise"] },
  { paletteId: "nature-emerald", keywords: ["nature", "plant", "garden", "eco", "sustainability", "green", "meditation"] },
  { paletteId: "gaming-neon", keywords: ["game", "gaming", "esports", "streaming", "arcade", "entertainment"] },
  { paletteId: "creative-purple", keywords: ["creative", "design", "art", "artist", "agency", "portfolio"] },
  { paletteId: "startup-violet", keywords: ["startup", "founder", "launch", "modern saas", "vc", "pitch"] },
  { paletteId: "professional-blue", keywords: ["business", "saas", "corporate", "crm", "dashboard", "workspace", "b2b", "enterprise"] },
  { paletteId: "news-charcoal", keywords: ["news", "blog", "article", "editorial", "publishing", "magazine", "media"] },
  { paletteId: "slate-neutral", keywords: ["minimal", "notes", "docs", "documentation", "knowledge base", "wiki"] },
];

function keywordPaletteFallback(prompt: string): string {
  const normalized = prompt.toLowerCase();
  for (const rule of PALETTE_KEYWORD_MAP) {
    if (rule.keywords.some((k) => normalized.includes(k))) {
      return rule.paletteId;
    }
  }
  return "warm-orange";
}

// ─── HTTP helper ───────────────────────────────────────────────────────────

async function slmPost<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLM_TIMEOUT_MS);
  try {
    const res = await fetch(`${SLM_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`SLM returned ${res.status}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Identify the best matching template for a prompt using semantic similarity.
 *
 * Sends ALL templates (both the 11 AI-generated TemplateDefinitions and the
 * prebuilt manifest templates) to the sidecar so it can score across the full
 * catalogue.  The result is filtered to valid TemplateId values so the existing
 * pipeline is unchanged.
 *
 * TODO: remove the TemplateId filter once the build pipeline supports routing
 * to prebuilt templates directly.
 */
export async function matchTemplate(input: {
  prompt: string;
  plan?: InitialBuildPlan;
}): Promise<TemplateSelectionResult> {
  const definitions = listTemplateDefinitions();
  const prebuilt = listPrebuiltTemplates();
  const validIds = new Set<string>(definitions.map((t) => t.id));

  const augmentedPrompt = input.plan
    ? `${input.prompt} ${input.plan.intentSummary} ${input.plan.keywords.join(" ")}`
    : input.prompt;

  try {
    const allTemplates = [
      ...definitions.map((t) => ({
        id: t.id,
        description: `${t.description} ${t.promptHints.join(" ")}`,
        tags: [] as string[],
      })),
      ...prebuilt.map((t) => ({
        id: t.manifest.id,
        description: t.manifest.description,
        tags: [...t.manifest.tags],
      })),
    ];

    const ranked = await slmPost<Array<{ templateId: string; confidence: number }>>(
      "/match-template",
      { prompt: augmentedPrompt, templates: allTemplates },
    );

    // Filter to only TemplateId values until prebuilt routing is supported
    const best = ranked.find((r) => validIds.has(r.templateId));
    if (!best) {
      return selectInitialBuildTemplate(input);
    }

    const selectedTemplate = definitions.find((t) => t.id === best.templateId);
    if (!selectedTemplate) {
      return selectInitialBuildTemplate(input);
    }

    const scores = ranked.reduce<Record<string, number>>((acc, r) => {
      acc[r.templateId] = r.confidence;
      return acc;
    }, {});

    console.log("SLM template match succeeded.", {
      selected: best.templateId,
      confidence: best.confidence,
    });

    return {
      template: selectedTemplate,
      reason: `SLM selected ${selectedTemplate.name} (confidence ${best.confidence.toFixed(2)}).`,
      scores: scores as Record<TemplateId, number>,
    };
  } catch (error) {
    console.warn("SLM template matching unavailable, falling back to keywords.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return selectInitialBuildTemplate(input);
  }
}

/**
 * Classify the best colour palette for a prompt.
 *
 * Falls back to keyword heuristics when the sidecar is unavailable.
 */
export async function classifyPalette(
  prompt: string,
  templateId: string = "",
): Promise<{ palette: string; confidence: number }> {
  try {
    return await slmPost<{ palette: string; confidence: number }>("/classify-palette", {
      prompt,
      template_id: templateId,
    });
  } catch {
    return { palette: keywordPaletteFallback(prompt), confidence: 0 };
  }
}
