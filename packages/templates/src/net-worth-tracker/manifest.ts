import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "net-worth-tracker",
  name: "Net Worth Tracker",
  description: "Track assets and liabilities with balance sheet and net worth trend",
  shell: "dashboard",
  accentColor: "#059669",
  tags: [
    "networth", "assets", "liabilities", "wealth", "finance",
    "balance-sheet", "personal", "tracker", "money", "chart", "savings",
  ],
} as const satisfies TemplateManifest;
