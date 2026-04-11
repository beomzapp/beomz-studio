import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "water-intake",
  name: "Water Intake Tracker",
  description: "Daily hydration tracking with glass counter, goal progress, and history",
  shell: "website",
  accentColor: "#0EA5E9",
  tags: [
    "water", "hydration", "health", "daily", "intake", "drink",
    "cups", "wellness", "goal", "tracker", "habit",
  ],
} as const satisfies TemplateManifest;
