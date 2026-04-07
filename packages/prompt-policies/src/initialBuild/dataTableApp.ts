import { sharedInitialBuildSystemRules } from "./shared/systemRules.js";

import type { InitialBuildPromptPolicy } from "./marketingWebsite.js";

export const dataTableAppInitialBuildPolicy = {
  templateId: "data-table-app",
  systemPrompt:
    "Generate a data-heavy management app with a sidebar plus topbar layout. The primary view should be a sortable, filterable data table with pagination, row actions, and a detail panel or modal that opens when a row is selected.",
  constraints: [
    ...sharedInitialBuildSystemRules,
    "Target operations-heavy apps such as inventory systems, HR tools, reporting dashboards, fleet management, or logistics software.",
    "Desktop layouts at 1024px and above must show a fixed left sidebar at w-64 and a topbar with page title, search, and avatar controls.",
    "Tablet layouts from 768px to 1023px must collapse the sidebar to a w-16 icon rail and support a hamburger-triggered slide-out overlay for the full nav.",
    "Mobile layouts below 768px must hide the sidebar by default and open it with a lucide-react Menu icon in the topbar. If the app has 2 to 5 primary mobile destinations, add a bottom tab nav with short labels and lucide-react icons.",
    "Make the main table dense but readable with realistic columns, filters, search, pagination, status badges, and row actions such as View, Edit, and Delete.",
  ],
} as const satisfies InitialBuildPromptPolicy;
