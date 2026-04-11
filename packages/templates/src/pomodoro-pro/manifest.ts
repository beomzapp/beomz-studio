import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "pomodoro-pro",
  name: "Pomodoro Pro",
  description: "Advanced pomodoro with task queue, daily stats, focus score, and session log",
  shell: "website",
  accentColor: "#EF4444",
  tags: [
    "pomodoro", "focus", "productivity", "timer", "deep-work",
    "tasks", "sessions", "stats", "work", "study", "technique",
  ],
} as const satisfies TemplateManifest;
