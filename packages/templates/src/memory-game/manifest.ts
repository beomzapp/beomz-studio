import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "memory-game",
  name: "Memory Game",
  description: "Flip card matching game with move counter, win detection, and difficulty levels",
  shell: "website",
  accentColor: "#7C3AED",
  tags: [
    "memory", "card", "match", "game", "fun", "concentration",
    "pairs", "flip", "grid", "puzzle", "kids",
  ],
} as const satisfies TemplateManifest;
