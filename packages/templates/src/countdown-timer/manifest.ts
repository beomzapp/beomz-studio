import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "countdown-timer",
  name: "Countdown Timer",
  description: "Countdown to a target time with days, hours, minutes, and seconds display",
  shell: "website",
  accentColor: "#DC2626",
  tags: [
    "countdown", "timer", "clock", "alarm", "time", "event", "deadline",
    "launch", "real-time", "interactive", "tool", "utility", "seconds",
  ],
} as const satisfies TemplateManifest;
