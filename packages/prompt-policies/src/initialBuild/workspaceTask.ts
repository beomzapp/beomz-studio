import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const workspaceTaskInitialBuildPolicy = {
  templateId: "workspace-task",
  systemPrompt:
    "Generate a collaborative workspace for teams managing tasks and work in progress. The pages should feel active, operational, and optimized for daily use rather than presentation.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Prioritize quick capture, status visibility, ownership, and team workflow cues.",
    "Make list and board views feel distinct, while keeping settings practical and team-oriented.",
    "Favor realistic task, board, and workflow scaffolding over generic placeholder marketing copy.",
  ],
} as const satisfies InitialBuildPromptPolicy;
