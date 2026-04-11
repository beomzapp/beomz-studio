import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "habit-tracker",
  name: "Habit Tracker",
  description: "Daily habit checklist with streak counter and 30-day heatmap calendar",
  shell: "website",
  accentColor: "#16A34A",
  tags: [
    "habit", "streak", "daily", "calendar", "heatmap", "routine",
    "consistency", "goals", "checklist", "wellness", "productivity",
  ],
} as const satisfies TemplateManifest;
