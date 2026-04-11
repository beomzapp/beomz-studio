import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "book-notes",
  name: "Book Notes",
  description: "Book notes and highlights organizer with key takeaways and personal reflections",
  shell: "website",
  accentColor: "#B45309",
  tags: [
    "book", "notes", "highlights", "reading", "takeaways",
    "reflection", "library", "learning", "summary", "education", "knowledge",
  ],
} as const satisfies TemplateManifest;
