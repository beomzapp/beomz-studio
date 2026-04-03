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
    "Generate a high-conviction public launch site for a startup or product launch. The content should feel polished, clear, and CTA-driven, with a hero, proof points, pricing clarity, and a contact path.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Keep the experience public and marketing-focused. Avoid authenticated UI patterns.",
    "Each page should reinforce the main value proposition and guide users toward a single next action.",
    "Use concise copy, strong headings, and obvious conversion moments.",
  ],
} as const satisfies InitialBuildPromptPolicy;
