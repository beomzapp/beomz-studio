import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "flashcard-quiz",
  name: "Flashcard Quiz",
  description: "Timed flashcard quiz with multiple decks, scoring, and spaced repetition hints",
  shell: "website",
  accentColor: "#D97706",
  tags: [
    "flashcard", "quiz", "study", "learn", "memory", "deck",
    "exam", "education", "timed", "score", "spaced-repetition",
  ],
} as const satisfies TemplateManifest;
