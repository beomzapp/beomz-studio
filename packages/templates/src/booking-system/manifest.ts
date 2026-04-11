import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "booking-system",
  name: "Booking System",
  description: "Appointment booking with calendar view, time slots, and confirmation flow",
  shell: "website",
  accentColor: "#0891B2",
  tags: [
    "booking", "appointment", "calendar", "schedule", "service",
    "salon", "clinic", "reservation", "slots", "time", "confirm",
  ],
} as const satisfies TemplateManifest;
