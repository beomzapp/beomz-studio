import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "bug-tracker",
  name: "Bug Tracker",
  description: "Issue tracker with priority levels, status workflow, assignees, and filtering",
  shell: "dashboard",
  accentColor: "#DC2626",
  tags: [
    "bug", "issue", "tracker", "priority", "status", "engineering",
    "software", "workflow", "assignee", "jira", "development",
  ],
} as const satisfies TemplateManifest;
