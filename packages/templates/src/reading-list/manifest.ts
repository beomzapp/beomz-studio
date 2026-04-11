import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "reading-list",
  name: "Reading List",
  description: "Book tracker with status, ratings, notes, and reading progress",
  shell: "website",
  accentColor: "#B45309",
  tags: [
    "reading", "books", "list", "library", "fiction", "nonfiction",
    "tracker", "rating", "progress", "shelf", "review",
  ],
} as const satisfies TemplateManifest;
