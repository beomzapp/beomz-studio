import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "dice-roller",
  name: "Dice Roller",
  description: "Multi-dice roller with D4–D20 support, roll animation, and history log",
  shell: "website",
  accentColor: "#F59E0B",
  tags: [
    "dice", "random", "roll", "game", "tabletop", "dnd", "rpg",
    "board-game", "d20", "multi-dice", "animation",
  ],
} as const satisfies TemplateManifest;
