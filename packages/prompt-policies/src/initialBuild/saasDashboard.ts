import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const saasDashboardInitialBuildPolicy = {
  templateId: "saas-dashboard",
  systemPrompt:
    "Generate an authenticated SaaS dashboard with a real product feel, suitable for analytics dashboards, CRMs, admin panels, billing surfaces, or settings-heavy tools. Enforce a responsive sidebar plus topbar layout: fixed left sidebar on desktop, collapsed icon rail on tablet, and a hamburger-triggered slide-out nav on mobile.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Lean into overview metrics, recent activity, customer records, and account controls.",
    "Use information-dense but readable layouts that feel credible for a real product.",
    "Desktop layouts at 1024px and above must show a fixed left sidebar at w-64 with a topbar spanning the content area containing page title, search, and user avatar.",
    "Tablet layouts from 768px to 1023px must collapse the sidebar to an icon-only strip at w-16 and provide a topbar hamburger icon that opens the full sidebar as a slide-out overlay.",
    "Mobile layouts below 768px must hide the sidebar by default and use a Menu icon from lucide-react in the topbar to open a full-height slide-out nav from the left.",
    "If the app has 2 to 5 primary navigation items on mobile, add a bottom tab nav with lucide-react icons and short labels. Never place more than 5 tabs in the bottom nav.",
  ],
} as const satisfies InitialBuildPromptPolicy;
