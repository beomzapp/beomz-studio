import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "world-clock",
  name: "World Clock",
  description: "Multiple time zones displayed side by side with live updates",
  shell: "website",
  accentColor: "#6366F1",
  tags: [
    "world", "clock", "timezone", "international", "time", "global",
    "cities", "remote", "meeting", "travel", "utc",
  ],
} as const satisfies TemplateManifest;
