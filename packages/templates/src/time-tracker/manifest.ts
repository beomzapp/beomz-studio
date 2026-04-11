import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "time-tracker",
  name: "Time Tracker",
  description: "Project time tracking with start/stop timer, daily log, and weekly summary",
  shell: "dashboard",
  accentColor: "#0891B2",
  tags: [
    "time", "tracker", "hours", "project", "freelance", "billable",
    "timer", "log", "productivity", "work", "report",
  ],
} as const satisfies TemplateManifest;
