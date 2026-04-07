import type { TemplateId } from "@beomz-studio/contracts";

import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

export interface InitialBuildPromptPolicy {
  templateId: TemplateId;
  systemPrompt: string;
  constraints: readonly string[];
}

export const marketingWebsiteInitialBuildPolicy = {
  templateId: "marketing-website",
  systemPrompt:
    "Generate a high-conviction public launch site for a startup or product launch. Build a full-width marketing website with a hero, features, social proof, pricing, CTA, and footer. Use a sticky top navbar with logo, links, and a CTA button. On mobile, convert the nav to a hamburger menu with a slide-out or dropdown. Do not use a sidebar or bottom navigation.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Keep the experience public and marketing-focused. Avoid authenticated UI patterns.",
    "Each page should reinforce the main value proposition and guide users toward a single next action.",
    "Use concise copy, strong headings, and obvious conversion moments.",
    "Enforce a full-width section flow: hero, features, social proof, pricing, CTA, footer.",
    "Use a sticky top navbar with brand, 3 to 5 clear nav links, and a prominent CTA button.",
    "Marketing and landing pages must never include a sidebar or bottom tab nav.",
    "On mobile, collapse navigation behind a hamburger menu from lucide-react using a slide-out panel or dropdown.",
  ],
} as const satisfies InitialBuildPromptPolicy;
