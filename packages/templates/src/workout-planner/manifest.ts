import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "workout-planner",
  name: "Workout Planner",
  description: "Weekly workout schedule builder with exercise library and muscle group targeting",
  shell: "dashboard",
  accentColor: "#DC2626",
  tags: [
    "workout", "planner", "gym", "fitness", "schedule", "exercise",
    "strength", "muscle", "weekly", "training", "routine",
  ],
} as const satisfies TemplateManifest;
