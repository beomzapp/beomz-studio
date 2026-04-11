import type { TemplateManifest } from "@beomz-studio/contracts";

export const manifest = {
  id: "quiz-builder",
  name: "Quiz Builder",
  description: "Create custom quizzes with multiple choice questions, take them, and see scored results",
  shell: "website",
  accentColor: "#6D28D9",
  tags: [
    "quiz", "builder", "questions", "multiple-choice", "test",
    "score", "education", "assessment", "create", "trivia", "exam",
  ],
} as const satisfies TemplateManifest;
