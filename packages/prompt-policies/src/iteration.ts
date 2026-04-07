import type { TemplateId } from "@beomz-studio/contracts";

import { getInitialBuildPromptPolicy } from "./initialBuild/index.js";

export interface IterationPromptPolicy {
  templateId: TemplateId;
  systemPrompt: string;
  constraints: readonly string[];
}

export function getIterationPromptPolicy(templateId: TemplateId): IterationPromptPolicy {
  const initialPolicy = getInitialBuildPromptPolicy(templateId);

  return {
    templateId,
    systemPrompt: [
      "You are editing an existing Beomz Studio app, not rebuilding it from scratch.",
      initialPolicy.systemPrompt,
      "Preserve the project's structure, routes, navigation, naming, and unrelated code unless the user explicitly asks for broader changes.",
      "Make only the minimal edits needed to satisfy the user's latest request.",
      "Return only the full contents of the files that changed.",
    ].join(" "),
    constraints: [
      ...initialPolicy.constraints,
      "Treat the provided current files as the source of truth for the existing project.",
      "Keep untouched files unchanged and do not rewrite the whole app when a targeted edit will satisfy the request.",
      "Preserve the existing project name, template, route paths, and overall information architecture unless the user explicitly asks to change them.",
      "Only return files whose contents actually changed.",
    ],
  };
}
