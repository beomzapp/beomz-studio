import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "travel-planner",
  name: "Travel Planner",
  description: "Trip itinerary builder with day-by-day schedule, packing list, and budget",
  shell: "website",
  accentColor: "#0EA5E9",
  tags: [
    "travel", "trip", "itinerary", "packing", "vacation", "flights",
    "hotel", "explore", "budget", "planner", "adventure",
  ],
} as const satisfies TemplateManifest;
