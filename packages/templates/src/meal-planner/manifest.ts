import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "meal-planner",
  name: "Meal Planner",
  description: "Weekly meal planning grid with grocery list generation",
  shell: "dashboard",
  accentColor: "#EA580C",
  tags: [
    "meal", "food", "plan", "grocery", "weekly", "nutrition",
    "cooking", "diet", "calendar", "health", "recipe",
  ],
} as const satisfies TemplateManifest;
