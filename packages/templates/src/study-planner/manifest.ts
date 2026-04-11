import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "study-planner",
  name: "Study Planner",
  description: "Subject-based study schedule with sessions, progress, and exam countdown",
  shell: "dashboard",
  accentColor: "#4338CA",
  tags: [
    "study", "schedule", "exam", "subject", "revision", "school",
    "student", "timetable", "sessions", "education", "planner",
  ],
} as const satisfies TemplateManifest;
