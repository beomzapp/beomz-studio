import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "daily-journal",
  name: "Daily Journal",
  description: "Daily writing journal with date entries, word count, and searchable archive",
  shell: "website",
  accentColor: "#A16207",
  tags: [
    "journal", "diary", "daily", "writing", "notes", "reflection",
    "archive", "personal", "gratitude", "mindfulness", "log",
  ],
} as const satisfies TemplateManifest;
