import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const workspaceTaskInitialBuildPolicy = {
  templateId: "workspace-task",
  systemPrompt:
    "Generate a collaborative task and project workspace for teams, suitable for project managers, task trackers, kanban boards, and team workspaces. Enforce a responsive sidebar plus topbar layout on desktop, a collapsible icon rail on tablet, and a slide-out navigation pattern on mobile with an optional bottom tab bar for the core flows.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Prioritize quick capture, status visibility, ownership, and team workflow cues.",
    "Make list and board views feel distinct, while keeping settings practical and team-oriented.",
    "Favor realistic task, board, and workflow scaffolding over generic placeholder marketing copy.",
    "Desktop layouts at 1024px and above must use a fixed left sidebar at w-64 and a topbar across the main content with title, search, and avatar actions.",
    "Tablet layouts from 768px to 1023px must collapse the sidebar to a w-16 icon rail and allow a hamburger control in the topbar to open the full sidebar as an overlay.",
    "Mobile layouts below 768px must hide the sidebar by default and reveal it with a lucide-react Menu button inside the topbar.",
    "For mobile-first core flows, you may add a bottom tab nav with up to 5 items such as Tasks, Board, Inbox, and Settings. Remaining destinations belong only in the slide-out nav.",
  ],
} as const satisfies InitialBuildPromptPolicy;
