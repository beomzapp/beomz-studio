import type { InitialBuildPlan, TemplateId, TemplateSelectionResult } from "@beomz-studio/contracts";
import { listTemplateDefinitions } from "@beomz-studio/templates";

const templateSignals: Record<TemplateId, readonly string[]> = {
  "marketing-website": [
    "company site",
    "contact",
    "cta",
    "hero",
    "landing page",
    "landing",
    "launch",
    "marketing",
    "marketing site",
    "pricing",
    "product page",
    "public",
    "saas homepage",
    "waitlist",
    "website",
    "website for my",
  ],
  "saas-dashboard": [
    "account manager",
    "account",
    "admin",
    "analytics",
    "crm",
    "customer",
    "deal",
    "deals",
    "lead",
    "leads",
    "metrics",
    "pipeline",
    "overview",
    "saas",
    "sales",
    "settings",
    "workspace billing",
  ],
  "workspace-task": [
    "backlog",
    "budget",
    "board",
    "calculator",
    "collaboration",
    "converter",
    "dashboard",
    "game",
    "kanban",
    "manager",
    "planner",
    "project",
    "sprint",
    "task",
    "team",
    "timer",
    "todo",
    "tool",
    "tracker",
    "workflow",
    "workspace",
    "app",
  ],
  "mobile-app": [
    "calories",
    "diary",
    "fitness",
    "habit",
    "journal",
    "meditation",
    "mobile",
    "personal",
    "streak",
    "tracker",
  ],
  "social-app": [
    "comment",
    "community",
    "dating",
    "feed",
    "follow",
    "forum",
    "like",
    "message",
    "post",
    "social",
  ],
  ecommerce: [
    "cart",
    "catalog",
    "checkout",
    "commerce",
    "marketplace",
    "product",
    "retail",
    "shop",
    "store",
  ],
  portfolio: [
    "agency",
    "case study",
    "creative",
    "freelancer",
    "personal brand",
    "portfolio",
    "resume",
    "showcase",
    "studio",
  ],
  "blog-cms": [
    "article",
    "author",
    "blog",
    "content",
    "documentation",
    "editorial",
    "magazine",
    "news",
    "post",
  ],
  "onboarding-flow": [
    "form flow",
    "multi-step",
    "onboarding",
    "quiz",
    "sign up",
    "stepper",
    "survey",
    "wizard",
  ],
  "data-table-app": [
    "back office",
    "data table",
    "employee",
    "filter",
    "fleet",
    "inventory",
    "lead management",
    "logistics",
    "operations console",
    "operations",
    "pagination",
    "pipeline report",
    "record management",
    "reporting",
    "sales ops",
    "sortable",
  ],
};

function countMatches(haystack: string, phrases: readonly string[]): number {
  return phrases.reduce((score, phrase) => {
    if (!haystack.includes(phrase)) {
      return score;
    }

    return score + (phrase.includes(" ") ? 4 : 2);
  }, 0);
}

function scoreTemplate(prompt: string, plan: InitialBuildPlan | undefined, templateId: TemplateId): number {
  const promptLower = prompt.toLowerCase();
  const planHaystack = plan ? `${plan.intentSummary.toLowerCase()} ${plan.keywords.join(" ")}` : "";

  let score = countMatches(promptLower, templateSignals[templateId]);
  score += countMatches(planHaystack, templateSignals[templateId]);

  if (templateId === "workspace-task" && score === 0) {
    score += 1;
  }

  return score;
}

export function selectInitialBuildTemplate(input: {
  prompt: string;
  plan?: InitialBuildPlan;
}): TemplateSelectionResult {
  const templates = listTemplateDefinitions();
  const scoredTemplates = templates
    .map((template) => ({
      score: scoreTemplate(input.prompt, input.plan, template.id),
      template,
    }))
    .sort((left, right) => right.score - left.score);

  const selected = scoredTemplates[0];
  if (!selected) {
    throw new Error("No templates are registered for the initial build pipeline.");
  }
  const scores = scoredTemplates.reduce<Record<TemplateId, number>>((accumulator, entry) => {
    accumulator[entry.template.id] = entry.score;
    return accumulator;
  }, {} as Record<TemplateId, number>);

  return {
    template: selected.template,
    reason:
      selected.score > 0
        ? `Selected ${selected.template.name} based on prompt intent keywords and route hints.`
        : `Defaulted to ${selected.template.name} because no stronger template-specific intent was detected.`,
    scores,
  };
}
