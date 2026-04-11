import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "debt-payoff-tracker",
  name: "Debt Payoff Tracker",
  description: "Track debts with avalanche vs snowball strategy comparison and payoff timeline",
  shell: "dashboard",
  accentColor: "#059669",
  tags: [
    "debt", "payoff", "avalanche", "snowball", "finance", "credit-card",
    "loan", "freedom", "tracker", "strategy", "interest",
  ],
} as const satisfies TemplateManifest;
