import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "flashcard-app",
  name: "Flashcard App",
  description: "Study flashcard deck with flip animation, scoring, and shuffle",
  shell: "website",
  accentColor: "#CA8A04",
  tags: [
    "flashcard", "quiz", "study", "learn", "memory", "deck", "exam",
    "education", "flip", "score", "cards", "spaced-repetition",
  ],
} as const satisfies TemplateManifest;
