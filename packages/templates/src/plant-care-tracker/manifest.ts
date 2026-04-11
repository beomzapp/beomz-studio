import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "plant-care-tracker",
  name: "Plant Care Tracker",
  description: "Houseplant manager with watering schedules, sunlight needs, and care log",
  shell: "website",
  accentColor: "#16A34A",
  tags: [
    "plant", "garden", "water", "schedule", "care", "houseplant",
    "green", "nature", "tracker", "indoor", "succulent",
  ],
} as const satisfies TemplateManifest;
