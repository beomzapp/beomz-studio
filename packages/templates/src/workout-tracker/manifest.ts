import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "workout-tracker",
  name: "Workout Tracker",
  description: "Log exercises with sets, reps, and weight plus session history",
  shell: "dashboard",
  accentColor: "#0F766E",
  tags: [
    "workout", "exercise", "gym", "fitness", "strength", "sets", "reps",
    "lifting", "health", "tracker", "log", "training",
  ],
} as const satisfies TemplateManifest;
