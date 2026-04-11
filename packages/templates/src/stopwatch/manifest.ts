import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "stopwatch",
  name: "Stopwatch",
  description: "Stopwatch with lap times, split recording, and precision display",
  shell: "website",
  accentColor: "#0EA5E9",
  tags: [
    "stopwatch", "lap", "split", "running", "race", "sport",
    "track", "timing", "precision", "tool", "clock",
  ],
} as const satisfies TemplateManifest;
