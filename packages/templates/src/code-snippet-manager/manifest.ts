import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "code-snippet-manager",
  name: "Code Snippet Manager",
  description: "Save and organize code snippets with language tags, search, and copy-to-clipboard",
  shell: "website",
  accentColor: "#A855F7",
  tags: [
    "code", "snippet", "manager", "developer", "clipboard", "language",
    "dark-theme", "creative", "programming", "gist", "collection",
  ],
} as const satisfies TemplateManifest;
