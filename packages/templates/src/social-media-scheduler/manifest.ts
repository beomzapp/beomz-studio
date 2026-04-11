import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "social-media-scheduler",
  name: "Social Media Scheduler",
  description: "Schedule posts across platforms with draft queue, calendar view, and analytics preview",
  shell: "dashboard",
  accentColor: "#7C3AED",
  tags: [
    "social", "media", "scheduler", "posts", "instagram", "twitter",
    "queue", "calendar", "creator", "marketing", "content",
  ],
} as const satisfies TemplateManifest;
