import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "contact-book",
  name: "Contact Book",
  description: "Address book with alphabetical grouping, search, favorites, and quick-add",
  shell: "website",
  accentColor: "#2563EB",
  tags: [
    "contact", "address", "book", "phone", "email", "directory",
    "favorites", "search", "people", "personal", "alphabetical",
  ],
} as const satisfies TemplateManifest;
