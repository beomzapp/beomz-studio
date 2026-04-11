import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "weight-tracker",
  name: "Weight Tracker",
  description: "Log weight entries with goal tracking, trend chart, and progress stats",
  shell: "dashboard",
  accentColor: "#10B981",
  tags: [
    "weight", "loss", "gain", "health", "body", "fitness",
    "progress", "scale", "goal", "tracker", "chart",
  ],
} as const satisfies TemplateManifest;
