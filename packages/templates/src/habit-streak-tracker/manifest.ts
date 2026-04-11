import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "habit-streak-tracker",
  name: "Habit Streak Tracker",
  description: "Visual streak-focused habit tracker with calendar grid and longest streak stats",
  shell: "website",
  accentColor: "#F59E0B",
  tags: [
    "habit", "streak", "calendar", "grid", "daily", "routine",
    "goals", "consistency", "tracker", "visual", "motivation",
  ],
} as const satisfies TemplateManifest;
