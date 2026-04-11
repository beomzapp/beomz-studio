import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "content-calendar",
  name: "Content Calendar",
  description: "Social media and content planning calendar with post scheduling and platform tags",
  shell: "dashboard",
  accentColor: "#E11D48",
  tags: [
    "content", "calendar", "social-media", "schedule", "planning",
    "marketing", "posts", "creator", "editorial", "publish", "campaign",
  ],
} as const satisfies TemplateManifest;
