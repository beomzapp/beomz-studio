import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "photo-gallery",
  name: "Photo Gallery",
  description: "Masonry photo gallery with lightbox, albums, and favorite tagging",
  shell: "website",
  accentColor: "#A855F7",
  tags: [
    "photo", "gallery", "images", "lightbox", "albums", "masonry",
    "dark-theme", "creative", "photography", "portfolio", "visual",
  ],
} as const satisfies TemplateManifest;
