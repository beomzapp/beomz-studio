import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "link-in-bio",
  name: "Link in Bio",
  description: "Customizable link-in-bio page with avatar, bio, social links, and themed cards",
  shell: "website",
  accentColor: "#8B5CF6",
  tags: [
    "linkinbio", "links", "social", "profile", "instagram", "creator",
    "bio", "personal", "landing", "linktree", "portfolio",
  ],
} as const satisfies TemplateManifest;
