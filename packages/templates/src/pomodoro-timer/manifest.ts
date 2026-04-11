import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "pomodoro-timer",
  name: "Pomodoro Timer",
  description: "25/5 work-break cycles with session counter, visual ring timer, and break alerts",
  shell: "website",
  accentColor: "#DC2626",
  tags: [
    "pomodoro", "focus", "work", "productivity", "break", "study",
    "timer", "deep-work", "technique", "sessions", "ring",
  ],
} as const satisfies TemplateManifest;
