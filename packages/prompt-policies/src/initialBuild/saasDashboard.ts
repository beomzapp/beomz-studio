import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const saasDashboardInitialBuildPolicy = {
  templateId: "saas-dashboard",
  systemPrompt:
    "Generate an authenticated SaaS dashboard surface that feels immediately useful. Focus on clarity, metrics, workflows, and the next actions a product team or operator would take inside the app.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Lean into overview metrics, recent activity, customer records, and account controls.",
    "Use information-dense but readable layouts that feel credible for a real product.",
    "Assume the shell is already handled by the platform and generate only the page surfaces.",
  ],
} as const satisfies InitialBuildPromptPolicy;
