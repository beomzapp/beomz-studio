import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const portfolioInitialBuildPolicy = {
  templateId: "portfolio",
  systemPrompt:
    "Generate a personal portfolio or agency website with full-width sections for hero, about, work, and contact. Keep it clean, minimal, and polished, with a sticky nav and a hamburger menu on mobile.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Use full-width sections for hero, about, skills or services, work or projects, and contact.",
    "Use a minimal sticky top nav with logo or name, anchor or page links, and one CTA.",
    "Highlight work with strong typography, project outcomes, testimonials, and clear service framing.",
    "On mobile, collapse navigation behind a hamburger menu or anchor-link dropdown.",
    "Do not use a sidebar or bottom tab nav.",
  ],
} as const satisfies InitialBuildPromptPolicy;
