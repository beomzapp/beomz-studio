import type {
  GeneratedAppManifest,
  StudioFile,
  TemplateDefinition,
} from "@beomz-studio/contracts";
import { buildGeneratedManifest, readGeneratedManifestFromFiles } from "@beomz-studio/contracts";

export type IterationIntent =
  | "auth_flow"
  | "new_page"
  | "ui_polish"
  | "db_wiring"
  | "general_edit";

export interface LayoutFingerprint {
  shell: TemplateDefinition["shell"];
  entryPath: string;
  navLabels: readonly string[];
  routePaths: readonly string[];
  shellOwnedPaths: readonly string[];
}

export function classifyIterationIntent(prompt: string): IterationIntent {
  const promptLower = prompt.toLowerCase();

  if (/\b(auth|authentication|login|log in|sign in|signup|sign up|logout|log out|profile access)\b/.test(promptLower)) {
    return "auth_flow";
  }

  if (/\b(add|create|build|make)\b[\s\S]{0,40}\b(page|screen|route|view|tab|section|settings)\b/.test(promptLower)) {
    return "new_page";
  }

  if (/\b(database|db|supabase|backend|schema|table|query|persist|save to database)\b/.test(promptLower)) {
    return "db_wiring";
  }

  if (/\b(theme|color|colou?r|spacing|restyle|polish|refine|responsive|sidebar|topbar|layout|font|contrast)\b/.test(promptLower)) {
    return "ui_polish";
  }

  return "general_edit";
}

export function getManifestFromFiles(
  template: TemplateDefinition,
  files: readonly Pick<StudioFile, "path" | "content">[],
): GeneratedAppManifest {
  return readGeneratedManifestFromFiles(template.id, files) ?? buildGeneratedManifest(template);
}

export function buildLayoutFingerprint(
  template: TemplateDefinition,
  files: readonly Pick<StudioFile, "path" | "content">[],
): LayoutFingerprint {
  const manifest = getManifestFromFiles(template, files);
  const shellOwnedPaths = files
    .map((file) => file.path)
    .filter((filePath) => /\/generated\/.+\/(theme|navigation)\.ts$/i.test(filePath)
      || /\/components\/generated\/.+\/AppShell\.tsx$/i.test(filePath)
      || /\/app\.manifest\.json$/i.test(filePath));

  return {
    entryPath: manifest.entryPath,
    navLabels: manifest.routes.filter((route) => route.inPrimaryNav).map((route) => route.label),
    routePaths: manifest.routes.map((route) => route.path),
    shell: manifest.shell,
    shellOwnedPaths,
  };
}

export function buildIterationPromptBlock(input: {
  fingerprint: LayoutFingerprint;
  intent: IterationIntent;
}): string {
  return [
    `ITERATION INTENT: ${input.intent}`,
    "CURRENT APP STRUCTURE (preserve unless explicitly asked to change it):",
    `- Shell: ${input.fingerprint.shell}`,
    `- Entry path: ${input.fingerprint.entryPath}`,
    `- Primary navigation: ${input.fingerprint.navLabels.join(", ") || "None"}`,
    `- Route paths: ${input.fingerprint.routePaths.join(", ")}`,
    `- Shell-owned files: ${input.fingerprint.shellOwnedPaths.join(", ") || "None"}`,
    "",
    "ITERATION RULES:",
    "- Inspect before editing. Prefer listFiles and readFile before any mutation.",
    "- Prefer editFile over createFile when a request can be satisfied by changing an existing file.",
    "- Preserve shell-owned files, route paths, and primary navigation labels unless the user explicitly asks to change them.",
    "- Styling and layout edits should target theme, shared UI, navigation, or AppShell files before route files.",
    "- If you add a new page, you must update the route manifest and navigation config plus create the route file itself.",
    "- Never rebuild the entire app when a targeted edit will satisfy the request.",
  ].join("\n");
}

export function normalizeSemanticNavLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/^my\s+/, "")
    .replace(/\b(sign\s*in|log\s*in)\b/g, "login")
    .replace(/\b(sign\s*up)\b/g, "signup")
    .replace(/\b(log\s*out|sign\s*out)\b/g, "logout")
    .replace(/\bmy account\b/g, "account")
    .replace(/\bmy profile\b/g, "profile")
    .replace(/\s+/g, " ")
    .trim();
}

export function findDuplicateSemanticNavLabels(labels: readonly string[]): readonly string[] {
  const grouped = new Map<string, string[]>();

  for (const label of labels) {
    const normalized = normalizeSemanticNavLabel(label);
    if (!normalized) {
      continue;
    }

    const existing = grouped.get(normalized) ?? [];
    if (!existing.includes(label)) {
      existing.push(label);
    }
    grouped.set(normalized, existing);
  }

  return Array.from(grouped.values())
    .filter((group) => group.length > 1)
    .map((group) => group.join(" / "));
}
