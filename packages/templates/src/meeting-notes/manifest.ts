import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "meeting-notes",
  name: "Meeting Notes",
  description: "Meeting notes with agenda, attendees, action items, and follow-up tracking",
  shell: "website",
  accentColor: "#2563EB",
  tags: [
    "meeting", "notes", "agenda", "action-items", "attendees",
    "minutes", "follow-up", "work", "business", "standup", "productivity",
  ],
} as const satisfies TemplateManifest;
