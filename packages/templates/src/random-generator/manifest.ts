import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "random-generator",
  name: "Random Generator",
  description: "Generate random names, numbers, ideas, and coin flips with history",
  shell: "website",
  accentColor: "#8B5CF6",
  tags: [
    "random", "generator", "name", "idea", "inspiration", "pick",
    "spinner", "coin", "number", "tool", "fun",
  ],
} as const satisfies TemplateManifest;
