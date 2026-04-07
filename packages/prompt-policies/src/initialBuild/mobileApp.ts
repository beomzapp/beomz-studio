import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const mobileAppInitialBuildPolicy = {
  templateId: "mobile-app",
  systemPrompt:
    "Generate a mobile-first consumer app with a phone-frame layout. Use a bottom tab nav with 3 to 5 lucide-react icons and short labels, touch-friendly tap targets, and a centered max-width 390px viewport that feels like a real iOS or Android app.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Target mobile-first consumer experiences such as fitness trackers, habit trackers, journals, personal finance apps, food diaries, or meditation apps.",
    "Keep the overall layout centered in a max-width 390px phone frame, even on desktop previews.",
    "Use a top bar with a clear screen title and one action icon from lucide-react.",
    "Use a bottom tab nav with 3 to 5 primary destinations only. Do not use a sidebar.",
    "Ensure all buttons, inputs, tabs, and list rows are touch-friendly with minimum 44px tap targets.",
  ],
} as const satisfies InitialBuildPromptPolicy;
