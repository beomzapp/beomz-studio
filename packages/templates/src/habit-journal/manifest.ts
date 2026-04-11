import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "habit-journal",
  name: "Habit Journal",
  description: "Combined habit tracker and daily journal with mood, gratitude, and reflection prompts",
  shell: "website",
  accentColor: "#EC4899",
  tags: [
    "habit", "journal", "daily", "mood", "gratitude", "reflection",
    "wellness", "diary", "prompts", "self-care", "mindfulness",
  ],
} as const satisfies TemplateManifest;
