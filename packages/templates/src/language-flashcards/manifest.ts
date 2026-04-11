import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "language-flashcards",
  name: "Language Flashcards",
  description: "Vocabulary flashcards with multiple language packs, pronunciation hints, and scoring",
  shell: "website",
  accentColor: "#2563EB",
  tags: [
    "language", "vocab", "foreign", "learn", "translate", "spanish",
    "french", "flashcard", "pronunciation", "education", "quiz",
  ],
} as const satisfies TemplateManifest;
