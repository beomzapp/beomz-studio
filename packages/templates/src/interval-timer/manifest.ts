import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "interval-timer",
  name: "Interval Timer",
  description: "HIIT workout interval timer with work/rest phases, rounds, and audio cues",
  shell: "website",
  accentColor: "#EF4444",
  tags: [
    "interval", "hiit", "workout", "fitness", "gym", "training",
    "rest", "rounds", "timer", "exercise", "tabata",
  ],
} as const satisfies TemplateManifest;
