import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const interactiveToolInitialBuildPolicy = {
  templateId: "interactive-tool",
  systemPrompt:
    "Generate a focused single-purpose interactive tool, calculator, counter, converter, timer, or game. The primary page must contain the core interactive surface with live state, inputs, and outputs. Keep navigation minimal — a simple top bar is sufficient. No sidebar required.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Target single-purpose utility experiences: calculators, counters, unit converters, stopwatches, timers, color pickers, random generators, word games, puzzle apps, or similar tools.",
    "The tool page must be self-contained and interactive: user inputs drive immediate visible output with live React state.",
    "Use a clean centered layout with a max-width of 640px. Do not add a sidebar, bottom tabs, or complex shell navigation.",
    "A simple top bar with the tool name and a lucide-react icon is sufficient — no sidebar or complex nav required.",
    "Seed the settings page with 3 to 5 realistic, tool-relevant configuration options such as precision, units, display format, or theme.",
    "Keep the experience focused and purposeful. Do not add features that are unrelated to the core tool function.",
  ],
} as const satisfies InitialBuildPromptPolicy;
