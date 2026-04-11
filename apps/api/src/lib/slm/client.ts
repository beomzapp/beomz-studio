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

// ─── Design system → base template pre-detection ─────────────────────────────
// When a prompt explicitly names a design system, skip semantic matching and
// return the corresponding base scaffold template directly.  This runs BEFORE
// the SLM call so the scaffold already looks like the requested design system.

const DS_TEMPLATE_MAP: Array<{ id: string; templateId: string; name: string; patterns: RegExp }> = [
  {
    id: "material",
    templateId: "material-base",
    name: "Material Design 3",
    patterns: /material\s*design|material\s*ui|\bmd3\b|material\s*you|\bgoogle\s*material\b/i,
  },
  {
    id: "apple-hig",
    templateId: "apple-hig-base",
    name: "Apple Human Interface Guidelines",
    patterns: /\bapple\s*hig\b|\bios\s*style\b|\bmacos\s*style\b|\bcupertino\b|\bapple\s*design\b/i,
  },
  {
    id: "linear",
    templateId: "linear-base",
    name: "Linear",
    patterns: /\blinear\s*style\b|\blinear\s*design\b|\blinear\s*app\b|\blike\s*linear\b/i,
  },
  {
    id: "asana",
    templateId: "asana-base",
    name: "Asana",
    patterns: /\basana\s*style\b|\basana\s*design\b|\blike\s*asana\b/i,
  },
  {
    id: "stripe",
    templateId: "stripe-base",
    name: "Stripe",
    patterns: /\bstripe\s*style\b|\bstripe\s*design\b|\bstripe\s*dashboard\b|\blike\s*stripe\b/i,
  },
  {
    id: "notion",
    templateId: "saas-dashboard-template", // closest available match — no notion-base yet
    name: "Notion",
    patterns: /\bnotion\s*style\b|\bnotion\s*design\b|\blike\s*notion\b/i,
  },
  {
    id: "vercel",
    templateId: "saas-dashboard-template", // closest available match — no vercel-base yet
    name: "Vercel",
    patterns: /\bvercel\s*style\b|\bvercel\s*design\b|\blike\s*vercel\b/i,
  },
];

function detectDesignSystemTemplate(prompt: string): { templateId: string; name: string } | null {
  for (const entry of DS_TEMPLATE_MAP) {
    if (entry.patterns.test(prompt)) {
      console.log("[slm] design system detected:", entry.id, "→ scaffold:", entry.templateId);
      return { templateId: entry.templateId, name: entry.name };
    }
  }
  return null;
}

// ─── Inlined keyword template selector (was in @beomz-studio/temporal-worker) ─

const TEMPLATE_SIGNALS: Record<TemplateId, readonly string[]> = {
  "marketing-website": ["company site","contact","cta","hero","landing page","landing","launch","marketing","pricing","product page","public","saas homepage","waitlist","website"],
  "saas-dashboard": ["account manager","account","admin","analytics","crm","customer","deal","deals","lead","leads","metrics","pipeline","overview","saas","sales","settings"],
  "workspace-task": ["backlog","budget","board","collaboration","dashboard","kanban","manager","planner","project","sprint","task","team","todo","tracker","workflow","workspace"],
  "mobile-app": ["calories","diary","fitness","habit","journal","meditation","mobile","personal","streak","tracker"],
  "social-app": ["comment","community","dating","feed","follow","forum","like","message","post","social"],
  ecommerce: ["cart","catalog","checkout","commerce","marketplace","product","retail","shop","store"],
  portfolio: ["agency","case study","creative","freelancer","personal brand","portfolio","resume","showcase","studio"],
  "blog-cms": ["article","author","blog","content","documentation","editorial","magazine","news","post"],
  "onboarding-flow": ["form flow","multi-step","onboarding","quiz","sign up","stepper","survey","wizard"],
  "data-table-app": ["back office","data table","employee","filter","fleet","inventory","lead management","logistics","operations console","operations","pagination","pipeline report","record management","reporting","sales ops","sortable"],
  "interactive-tool": ["calculator","clock","converter","counter","game","generator","puzzle","stopwatch","timer","tool","utility","widget"],
};

function countKwMatches(haystack: string, phrases: readonly string[]): number {
  return phrases.reduce((score, phrase) => haystack.includes(phrase) ? score + (phrase.includes(" ") ? 4 : 2) : score, 0);
}

function selectInitialBuildTemplate(input: { prompt: string; plan?: InitialBuildPlan }): TemplateSelectionResult {
  const templates = listTemplateDefinitions();
  const promptLower = input.prompt.toLowerCase();
  const planHaystack = input.plan ? `${input.plan.intentSummary.toLowerCase()} ${input.plan.keywords.join(" ")}` : "";

  const scored = templates
    .map((t) => ({
      template: t,
      score: countKwMatches(promptLower, TEMPLATE_SIGNALS[t.id]) + countKwMatches(planHaystack, TEMPLATE_SIGNALS[t.id]) + (t.id === "workspace-task" ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = scored[0] ?? { template: templates[0]!, score: 0 };
  const scores = scored.reduce<Record<TemplateId, number>>((acc, e) => { acc[e.template.id] = e.score; return acc; }, {} as Record<TemplateId, number>);

  return {
    template: selected.template,
    reason: selected.score > 0
      ? `Selected ${selected.template.name} based on prompt keywords.`
      : `Defaulted to ${selected.template.name}.`,
    scores,
  };
}

const SLM_BASE_URL = (process.env.SLM_BASE_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
const SLM_TIMEOUT_MS = 4_000;

// ─── Palette keyword fallback ──────────────────────────────────────────────

const PALETTE_KEYWORD_MAP: Array<{ paletteId: string; keywords: readonly string[] }> = [
  // BEO-266: finance/money prompts ALWAYS get professional-blue — listed before finance-green
  // so ties break in professional-blue's favour; generic finance keywords removed from finance-green.
  { paletteId: "professional-blue",keywords: ["business", "corporate", "crm", "workspace", "b2b", "enterprise", "report", "admin", "hr", "operations", "management", "office", "team", "employee", "company", "sales pipeline", "lead", "client", "account", "finance", "money", "budget", "expense", "invoice", "billing", "accounting"] },
  { paletteId: "crypto-dark",      keywords: ["crypto", "web3", "blockchain", "token", "defi", "wallet", "nft", "coin", "bitcoin", "ethereum", "dex", "swap", "mint", "dao"] },
  { paletteId: "law-navy",         keywords: ["law", "legal", "attorney", "lawyer", "compliance", "firm", "contract", "court", "justice", "regulation", "litigation"] },
  // finance-green kept for eco/sustainable-finance niche; generic finance terms moved to professional-blue
  { paletteId: "finance-green",    keywords: ["bookkeeping", "tax", "payment", "transaction", "salary", "income", "spending", "cost", "payroll", "bank", "wealth", "investment", "savings", "loan", "mortgage", "debt"] },
  { paletteId: "medical-blue",     keywords: ["medical", "clinic", "doctor", "hospital", "patient", "therapy", "dental", "clinical", "health record", "appointment", "prescription", "diagnosis", "nurse", "pharmacy", "telemedicine"] },
  { paletteId: "energy-red",       keywords: ["gym", "training", "sport", "sports", "athlete", "running", "performance", "exercise", "cardio", "strength", "crossfit", "marathon", "football", "soccer", "basketball", "tennis", "cycling", "rep", "lift", "weight lifting"] },
  // BEO-266: fitness/health/workout/food/recipe/meal/nutrition → warm-orange
  { paletteId: "warm-orange",      keywords: ["fitness", "health", "workout", "food", "recipe", "meal", "nutrition", "restaurant", "cook", "cafe", "coffee", "dining", "bakery", "menu", "kitchen", "ingredient", "cuisine", "dish", "eating", "snack", "catering", "delivery", "brunch", "dessert", "cocktail", "social", "community", "network", "connect", "chat", "messaging", "forum", "feed", "friend", "follow", "profile", "meetup"] },
  { paletteId: "health-teal",      keywords: ["wellness", "habit", "mindfulness", "yoga", "sleep", "water intake", "calorie", "meditation", "mental health", "stress", "mood", "bmi", "steps", "hydration"] },
  { paletteId: "warm-amber",       keywords: ["amber", "spice", "harvest", "autumn", "artisan", "craft", "market"] },
  { paletteId: "kids-yellow",      keywords: ["kids", "children", "school", "classroom", "teacher", "toddler", "preschool", "student", "education", "learn", "quiz", "flashcard", "spelling", "math", "science", "homework", "tutor", "grade", "pupil"] },
  // BEO-266: code/developer/api/database/terminal/software → midnight-indigo
  { paletteId: "midnight-indigo",  keywords: ["code", "developer", "api", "database", "terminal", "software", "study", "planner", "focus", "notes", "productivity", "todo", "task", "reminder", "agenda", "deadline", "project", "kanban", "board", "organize", "backlog", "sprint", "tracker", "track", "checklist", "goal", "habit tracker", "time management", "pomodoro"] },
  { paletteId: "retail-coral",     keywords: ["retail", "shop", "store", "shopping", "deal", "sale", "checkout", "cart", "product", "catalog", "inventory", "price", "order", "ecommerce", "discount", "marketplace", "listing"] },
  // BEO-266: social/creative/design/art/photo → rose-pink
  { paletteId: "rose-pink",        keywords: ["social", "creative", "design", "art", "photo", "photography", "beauty", "fashion", "skincare", "cosmetic", "lifestyle", "makeup", "wedding", "dating", "love", "gift", "style", "clothing", "jewellery", "jewelry", "bridal", "maternity", "women", "illustration", "animation"] },
  // BEO-266: travel/booking/events/calendar/schedule → coral-sunset (new palette)
  { paletteId: "coral-sunset",     keywords: ["travel", "booking", "events", "calendar", "schedule", "hotel", "flight", "cruise", "trip", "vacation", "explore", "adventure", "destination", "tourism", "airbnb", "hostel", "road trip", "backpack", "beach"] },
  { paletteId: "ocean-cyan",       keywords: ["water", "ocean", "surf", "sailing", "dive", "aqua", "marine"] },
  // BEO-266: medical/wellness/analytics/dashboard → ocean-teal (new palette)
  { paletteId: "ocean-teal",       keywords: ["analytics", "dashboard", "metrics", "reporting", "insights", "data", "monitoring", "chart", "graph", "kpi", "telemetry"] },
  { paletteId: "nature-emerald",   keywords: ["sustainability", "environment", "organic", "tree", "farm", "wildlife", "carbon", "recycle", "solar", "renewable"] },
  // BEO-266: nature/garden/plant/habit/eco → forest-green (new palette)
  { paletteId: "forest-green",     keywords: ["nature", "garden", "plant", "eco", "green", "forest", "outdoor", "hiking", "camping", "landscape", "botanical", "herbal", "seed", "compost"] },
  { paletteId: "gaming-neon",      keywords: ["game", "gaming", "esports", "streaming", "arcade", "entertainment", "puzzle", "trivia", "leaderboard", "score", "level", "player", "rpg", "fps", "strategy", "board game", "card game"] },
  { paletteId: "creative-purple",  keywords: ["creative agency", "brand studio", "artist portfolio", "design agency", "visual identity", "logo design", "motion design", "video editor", "content creator", "music", "podcast studio"] },
  { paletteId: "startup-violet",   keywords: ["startup", "founder", "launch", "saas", "vc", "pitch", "mvp", "landing page", "waitlist", "early access", "product hunt", "investor", "accelerator", "b2c"] },
  { paletteId: "news-charcoal",    keywords: ["news", "blog", "article", "editorial", "publishing", "magazine", "media", "journalist", "newsletter", "digest", "press", "reporting", "podcast"] },
  { paletteId: "slate-neutral",    keywords: ["minimal", "notes", "docs", "documentation", "knowledge base", "wiki", "simple", "clean", "note", "write", "journal", "diary", "log", "memo", "reference"] },
];

// Curated rotation for when no keyword matches (ensures visual variety).
// Purples (startup-violet, creative-purple, midnight-indigo) are interleaved
// so consecutive builds never look the same shade of purple.
const FALLBACK_PALETTE_ROTATION = [
  "professional-blue",
  "warm-orange",
  "startup-violet",
  "ocean-cyan",
  "creative-purple",
  "nature-emerald",
  "midnight-indigo",
  "gaming-neon",
  "slate-neutral",
];
let fallbackRotationIndex = 0;

function keywordPaletteFallback(prompt: string): { palette: string; reason: string } {
  const normalized = prompt.toLowerCase();

  // Score every palette — highest match wins (multi-keyword prompts score better)
  let bestPalette = "";
  let bestScore = 0;

  for (const rule of PALETTE_KEYWORD_MAP) {
    const score = rule.keywords.reduce((s, k) => (normalized.includes(k) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      bestPalette = rule.paletteId;
    }
  }

  if (bestScore > 0) {
    return { palette: bestPalette, reason: `keyword match (score ${bestScore})` };
  }

  // No keyword hit — rotate through curated list so every build looks different
  const palette = FALLBACK_PALETTES[fallbackRotationIndex % FALLBACK_PALETTES.length]!;
  fallbackRotationIndex = (fallbackRotationIndex + 1) % FALLBACK_PALETTES.length;
  return { palette, reason: "rotation fallback" };
}

// Keep named list in sync with rotation array above
const FALLBACK_PALETTES = FALLBACK_PALETTE_ROTATION;

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

  // ── Design system pre-check ────────────────────────────────────────────────
  // If the prompt explicitly names a design system (Material Design, Apple HIG,
  // Linear, etc.) select the corresponding base scaffold template directly,
  // bypassing both the SLM and keyword scoring.
  const ds = detectDesignSystemTemplate(augmentedPrompt);
  if (ds) {
    const prebuiltMatch = prebuilt.find((t) => t.manifest.id === ds.templateId);
    if (prebuiltMatch) {
      return {
        template: {
          id: ds.templateId as TemplateId,
          name: prebuiltMatch.manifest.name,
          description: prebuiltMatch.manifest.description,
          shell: prebuiltMatch.manifest.shell,
          defaultProjectName: ds.name,
          previewEntryPath: "/",
          promptHints: [],
          pages: [],
        },
        reason: `Design system detected (${ds.name}) → scaffold: ${ds.templateId}`,
        scores: {} as Record<TemplateId, number>,
      };
    }
  }

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
    const result = await slmPost<{ palette: string; confidence: number }>("/classify-palette", {
      prompt,
      template_id: templateId,
    });
    console.log("[palette] SLM classified:", result.palette, { confidence: result.confidence, templateId });
    return result;
  } catch {
    const { palette, reason } = keywordPaletteFallback(prompt);
    console.log("[palette] keyword fallback →", palette, `(${reason})`, { prompt: prompt.slice(0, 80) });
    return { palette, confidence: 0 };
  }
}
