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
    "Use a clean centered layout: wrap the main interactive content in a div with className='mx-auto max-w-lg w-full' so the tool is centered on the page.",
    "A simple top bar with the tool name and a lucide-react icon is sufficient — no sidebar or complex nav required.",
    "Seed the settings page with 3 to 5 realistic, tool-relevant configuration options such as precision, units, display format, or theme.",
    "Keep the experience focused and purposeful. Do not add features that are unrelated to the core tool function.",
    "Always use the scaffold PrimaryButton component for the main action buttons. Import it as: import { PrimaryButton } from '@/components/generated/interactive-tool/ui/PrimaryButton'.",
    "Always wrap the main interactive surface in the scaffold SurfaceCard component. Import it as: import { SurfaceCard } from '@/components/generated/interactive-tool/ui/SurfaceCard'.",
    "Every button in the tool must have a className with explicit Tailwind utility classes for background, text color, padding, and border-radius — for example: className='rounded-lg bg-gray-700 px-4 py-3 text-white hover:bg-gray-600 transition-colors'. Never render a plain unstyled <button>.",
    "Primary display output values (calculator result, counter value, converted amount) must be large and centered: use text-5xl or text-4xl font-bold text-white text-center.",
    "Input fields must use dark-surface styling: className='w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-orange-500'.",
  ],
} as const satisfies InitialBuildPromptPolicy;
