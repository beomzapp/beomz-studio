import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const workspaceTaskInitialBuildPolicy = {
  templateId: "workspace-task",
  systemPrompt:
    "Generate a productivity app tailored to the user's specific request. This template covers the full spectrum of personal and team task managers: todo lists, budget trackers, expense managers, habit trackers, project planners, kanban boards, and team workspaces. Match the content, data labels, and UI density to the exact app type the user described — a todo app should show todos, a budget tracker should show income and expenses, a habit tracker should show habits and streaks. Enforce a responsive sidebar plus topbar layout on desktop, a collapsible icon rail on tablet, and a slide-out navigation pattern on mobile with an optional bottom tab bar for the core flows.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Read the user's prompt carefully and generate domain-appropriate data and UI: todo apps show task lists with checkboxes; budget trackers show income/expense rows and a balance summary; habit trackers show habit rows with streak counters; project managers show projects with status columns.",
    "Never generate generic marketing placeholder copy (e.g. 'Validate preview bootstrap', 'Review generated landing copy') — all task titles, budget items, and data labels must be realistic examples that match the app type in the prompt.",
    "Use the generatedTheme accent color from the scaffold for interactive elements (buttons, active states, badges). Do not hardcode a different accent color.",
    "Prioritize quick capture, status visibility, and relevant workflow cues for the specific domain.",
    "Make list and board views feel distinct, while keeping settings practical and relevant to the app domain.",
    "Favor realistic, domain-specific data scaffolding over generic placeholder content.",
    "Desktop layouts at 1024px and above must use a fixed left sidebar at w-64 and a topbar across the main content with title, search, and avatar actions.",
    "Tablet layouts from 768px to 1023px must collapse the sidebar to a w-16 icon rail and allow a hamburger control in the topbar to open the full sidebar as an overlay.",
    "Mobile layouts below 768px must hide the sidebar by default and reveal it with a lucide-react Menu button inside the topbar.",
    "For mobile-first core flows, you may add a bottom tab nav with up to 5 items such as Tasks, Board, Inbox, and Settings. Remaining destinations belong only in the slide-out nav.",
  ],
} as const satisfies InitialBuildPromptPolicy;
