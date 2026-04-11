import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "subscription-tracker",
  name: "Subscription Tracker",
  description: "Track recurring subscriptions with costs, renewal dates, and monthly total",
  shell: "dashboard",
  accentColor: "#E11D48",
  tags: [
    "subscription", "saas", "service", "renewal", "monthly", "recurring",
    "software", "cost", "tracker", "billing", "manage",
  ],
} as const satisfies TemplateManifest;
