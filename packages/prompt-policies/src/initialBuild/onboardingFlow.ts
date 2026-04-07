import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const onboardingFlowInitialBuildPolicy = {
  templateId: "onboarding-flow",
  systemPrompt:
    "Generate a multi-step onboarding or sign-up flow with a progress indicator at the top. Each step should be a focused, centered form or choice screen with Back and Next buttons, ending in a clear confirmation screen.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Use a single-page multi-step flow with a centered max-w-lg container and a visible progress indicator such as Step 1 of 4.",
    "Each step should focus on one task only, such as account details, preferences, team setup, plan choice, or confirmation.",
    "Provide clear Back and Next controls on every step after the first, and end with a dedicated success or confirmation state.",
    "Keep the layout clean, minimal, and full-width responsive on mobile without sidebars or bottom nav.",
    "Forms must feel realistic with concrete field labels, placeholders, helper text, and validation cues.",
  ],
} as const satisfies InitialBuildPromptPolicy;
