import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "resume-builder",
  name: "Resume Builder",
  description: "Interactive resume editor with sections for experience, skills, and education",
  shell: "website",
  accentColor: "#4338CA",
  tags: [
    "resume", "cv", "builder", "career", "job", "professional",
    "experience", "skills", "education", "portfolio", "hire",
  ],
} as const satisfies TemplateManifest;
