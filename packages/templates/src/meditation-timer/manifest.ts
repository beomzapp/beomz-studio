import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "meditation-timer",
  name: "Meditation Timer",
  description: "Guided meditation timer with breathing animation, session presets, and streak tracking",
  shell: "website",
  accentColor: "#7C3AED",
  tags: [
    "meditation", "mindfulness", "calm", "breathing", "focus",
    "zen", "wellness", "stress", "timer", "session", "relaxation",
  ],
} as const satisfies TemplateManifest;
