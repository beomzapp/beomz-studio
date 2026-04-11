import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "event-planner",
  name: "Event Planner",
  description: "Event organizer with guest list, schedule timeline, and budget tracker",
  shell: "website",
  accentColor: "#DB2777",
  tags: [
    "event", "party", "wedding", "schedule", "guests", "venue",
    "budget", "coordinator", "timeline", "planner", "rsvp",
  ],
} as const satisfies TemplateManifest;
