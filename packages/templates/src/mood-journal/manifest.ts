import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "mood-journal",
  name: "Mood Journal",
  description: "Daily mood logging with emoji picker, notes, and trend chart",
  shell: "website",
  accentColor: "#EC4899",
  tags: [
    "mood", "journal", "mental-health", "daily", "emotion", "feelings",
    "wellbeing", "diary", "tracker", "chart", "self-care",
  ],
} as const satisfies TemplateManifest;
