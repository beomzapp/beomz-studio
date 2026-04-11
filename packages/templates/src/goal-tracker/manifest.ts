import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "goal-tracker",
  name: "Goal Tracker",
  description: "OKR-style goal tracking with milestones and progress bars",
  shell: "dashboard",
  accentColor: "#2563EB",
  tags: [
    "goal", "okr", "progress", "objective", "milestone", "quarterly",
    "kpi", "target", "tracker", "achievement", "productivity",
  ],
} as const satisfies TemplateManifest;
