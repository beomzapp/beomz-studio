import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "trivia-game",
  name: "Trivia Game",
  description: "Multiple-choice trivia with timer, score tracking, and results summary",
  shell: "website",
  accentColor: "#6D28D9",
  tags: [
    "trivia", "quiz", "game", "question", "score", "fun", "categories",
    "leaderboard", "timer", "multiple-choice", "entertainment", "challenge",
  ],
} as const satisfies TemplateManifest;
