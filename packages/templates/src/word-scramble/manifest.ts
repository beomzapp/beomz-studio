import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "word-scramble",
  name: "Word Scramble",
  description: "Unscramble letters to form words with scoring, hints, and progressive difficulty",
  shell: "website",
  accentColor: "#2563EB",
  tags: [
    "word", "scramble", "puzzle", "game", "letters", "anagram",
    "brain", "teaser", "vocabulary", "spelling", "education",
  ],
} as const satisfies TemplateManifest;
