import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "sleep-tracker",
  name: "Sleep Tracker",
  description: "Log sleep times with quality rating, weekly average, and trend display",
  shell: "dashboard",
  accentColor: "#8B5CF6",
  tags: [
    "sleep", "rest", "health", "quality", "hours", "bedtime",
    "wellness", "insomnia", "tracker", "log", "night",
  ],
} as const satisfies TemplateManifest;
