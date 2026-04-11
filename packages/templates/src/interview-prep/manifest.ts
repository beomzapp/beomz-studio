import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "interview-prep",
  name: "Interview Prep",
  description: "Interview preparation tracker with question bank, practice sessions, and confidence rating",
  shell: "website",
  accentColor: "#4338CA",
  tags: [
    "interview", "preparation", "career", "job", "questions",
    "practice", "confidence", "hiring", "behavioral", "technical", "prep",
  ],
} as const satisfies TemplateManifest;
