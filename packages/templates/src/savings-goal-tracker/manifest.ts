import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "savings-goal-tracker",
  name: "Savings Goal Tracker",
  description: "Multiple savings goals with progress bars, contribution log, and target dates",
  shell: "website",
  accentColor: "#16A34A",
  tags: [
    "savings", "goal", "progress", "money", "finance", "target",
    "emergency-fund", "tracker", "contributions", "timeline", "budget",
  ],
} as const satisfies TemplateManifest;
