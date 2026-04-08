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
      "Inspect the current project before editing it.",
      "Prefer the smallest targeted change that satisfies the new request.",
      "Theme, navigation, manifest, shared UI, and AppShell files are the preferred edit targets for global styling or layout changes.",
      "If the request adds a new page, update the generated route manifest and navigation config together with the new route file.",
      "Preserve the project's structure, routes, navigation, naming, and unrelated code unless the user explicitly asks for broader changes.",
      initialPolicy.systemPrompt,
      "IMPORTANT: You must call the finish tool within a maximum of 5 file edits. Do not read every file before editing. Identify the most relevant file for the requested change, edit it directly, then call finish immediately. Be decisive and concise.",
    ].join(" "),
    constraints: [
      ...initialPolicy.constraints,
      "Treat the provided current files as the source of truth for the existing project.",
      "Read before you write. Use inspection tools before mutating files whenever the exact current content matters.",
      "Keep untouched files unchanged and do not rewrite the whole app when a targeted edit will satisfy the request.",
      "Preserve the existing project name, template, route paths, and overall information architecture unless the user explicitly asks to change them.",
      "Prefer editFile over createFile when an existing file can satisfy the request.",
      "Only create new files when the user request truly requires a new route, component, data module, or asset inside allowed generated directories.",
      "When editing styling, layout, or navigation, target scaffold files first before route files.",
    ],
  };
}
