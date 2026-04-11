import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "pet-care-tracker",
  name: "Pet Care Tracker",
  description: "Pet profiles with vet visits, medication schedule, and feeding log",
  shell: "dashboard",
  accentColor: "#F59E0B",
  tags: [
    "pet", "dog", "cat", "vet", "medication", "feeding",
    "grooming", "care", "health", "tracker", "animal",
  ],
} as const satisfies TemplateManifest;
