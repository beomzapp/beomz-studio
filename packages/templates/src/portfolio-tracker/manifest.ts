import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "portfolio-tracker",
  name: "Portfolio Tracker",
  description: "Investment portfolio with holdings, allocation chart, gain/loss tracking, and performance",
  shell: "dashboard",
  accentColor: "#059669",
  tags: [
    "portfolio", "investment", "stocks", "holdings", "allocation",
    "gain", "loss", "performance", "finance", "market", "tracker",
  ],
} as const satisfies TemplateManifest;
