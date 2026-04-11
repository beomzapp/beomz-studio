import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "daily-standup",
  name: "Daily Standup",
  description: "Team standup notes with yesterday/today/blockers format and history archive",
  shell: "website",
  accentColor: "#F59E0B",
  tags: [
    "standup", "daily", "scrum", "team", "yesterday", "today",
    "blockers", "agile", "work", "meeting", "engineering",
  ],
} as const satisfies TemplateManifest;
