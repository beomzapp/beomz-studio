import type {
  OperationActor,
  OperationContract,
  Project,
  TemplateDefinition,
} from "@beomz-studio/contracts";
import { getInitialBuildPromptPolicy } from "@beomz-studio/prompt-policies";
import { getTemplateDefinition } from "@beomz-studio/templates";

import {
  CORE_ACTIONS,
  type ActionDefinition,
} from "./actions/index.js";
import type { VirtualFileSystem } from "./VirtualFileSystem.js";

export const ANTHROPIC_CACHE_BOUNDARY_MARKER = "<beomz-cache-boundary/>";

export interface AnthropicCacheControl {
  type: "ephemeral";
}

export interface AnthropicSystemTextBlock {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
}

export interface SystemPromptFrame {
  staticSection: string;
  dynamicSection: string;
  cacheBoundaryMarker: typeof ANTHROPIC_CACHE_BOUNDARY_MARKER;
  system: readonly AnthropicSystemTextBlock[];
}

export interface BuildSystemPromptInput {
  actor?: OperationActor;
  actionDefinitions?: readonly ActionDefinition[];
  operation: OperationContract;
  project: Pick<
    Project,
    "id" | "name" | "orgId" | "previewEntryPath" | "status" | "templateId"
  >;
  prompt: string;
  template?: TemplateDefinition;
  turn: number;
  userPreferences?: Record<string, unknown>;
  vfs: VirtualFileSystem;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildStaticSection(actionDefinitions: readonly ActionDefinition[]): string {
  const toolDescriptions = actionDefinitions
    .map((action) =>
      [
        `Action: ${action.name}`,
        `Description: ${action.description}`,
        "Input schema:",
        formatJson(action.jsonSchema),
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "STATIC SECTION",
    "You are the Beomz Studio Generation Engine, the core builder that turns a user request into a durable workspace through tool-driven execution.",
    "You work in loops: inspect context, choose actions, wait for action results, then continue until the work is complete.",
    "Non-negotiable rules:",
    "- Never modify packages/kernel/**. The kernel is frozen platform code.",
    "- Never write outside the operation contract allowlist. Denied and immutable globs are hard stops.",
    "- Use readFile and listFiles for inspection. Use createFile, editFile, deleteFile, and addComponent for durable source changes.",
    "- runCommand operates against a disposable sandbox mounted from the current VFS snapshot. Sandbox file writes do not persist back into the VFS.",
    "- finish is required to end the run. It must always include deferredItems as a flat string array, even if the array is empty.",
    "- Keep the generated surface aligned with the selected template, prompt policy, and write scope.",
    "- Prefer incremental edits over wholesale rewrites when a file already exists.",
    "- If an action fails, recover by inspecting the returned error and trying a better action. Do not ignore failures.",
    "",
    "Available action tool definitions:",
    toolDescriptions,
  ].join("\n");
}

function buildVfsSection(vfs: VirtualFileSystem, maxInlineChars = 16_000): string {
  const snapshot = vfs.snapshot();

  if (snapshot.files.length === 0) {
    return "Current VFS state:\n- No files exist yet.";
  }

  const fileIndex = snapshot.files
    .map((file) => `- ${file.path} (${file.content.length} chars)`)
    .join("\n");

  const contentBlocks: string[] = [];
  let remainingChars = maxInlineChars;

  for (const file of snapshot.files) {
    if (remainingChars <= 0) {
      contentBlocks.push("--- ADDITIONAL FILE CONTENT OMITTED FOR BREVITY ---");
      break;
    }

    const excerpt =
      file.content.length > remainingChars
        ? `${file.content.slice(0, remainingChars)}\n/* truncated */`
        : file.content;

    remainingChars -= excerpt.length;
    contentBlocks.push(`--- FILE: ${file.path} ---\n${excerpt}\n--- END FILE ---`);
  }

  return [
    `Current VFS state (${snapshot.files.length} files):`,
    fileIndex,
    "",
    "Inline file contents:",
    ...contentBlocks,
  ].join("\n");
}

function buildDynamicSection(input: BuildSystemPromptInput): string {
  const template = input.template ?? getTemplateDefinition(input.project.templateId);
  const promptPolicy = getInitialBuildPromptPolicy(template.id);

  return [
    "DYNAMIC SECTION",
    `Turn: ${input.turn}`,
    `User request: ${input.prompt}`,
    "",
    "Project context:",
    formatJson({
      id: input.project.id,
      name: input.project.name,
      orgId: input.project.orgId,
      previewEntryPath: input.project.previewEntryPath,
      status: input.project.status,
      templateId: input.project.templateId,
    }),
    input.actor
      ? ["", "Actor context:", formatJson(input.actor)].join("\n")
      : "",
    "",
    "Template context:",
    formatJson({
      defaultProjectName: template.defaultProjectName,
      description: template.description,
      id: template.id,
      name: template.name,
      pages: template.pages,
      previewEntryPath: template.previewEntryPath,
      promptHints: template.promptHints,
      shell: template.shell,
    }),
    "",
    "Template prompt policy:",
    formatJson({
      constraints: promptPolicy.constraints,
      systemPrompt: promptPolicy.systemPrompt,
      templateId: promptPolicy.templateId,
    }),
    "",
    "Operation contract:",
    formatJson({
      allowedTemplates: input.operation.allowedTemplates,
      description: input.operation.description,
      id: input.operation.id,
      owner: input.operation.owner,
      validations: input.operation.validations,
      version: input.operation.version,
      writeScope: input.operation.writeScope,
    }),
    "",
    "User preferences:",
    formatJson(input.userPreferences ?? {}),
    "",
    buildVfsSection(input.vfs),
    "",
    "Execution guidance:",
    "- Use the current VFS as the source of truth.",
    "- If you need exact contents, call readFile instead of guessing.",
    "- When the requested work is complete, call finish with a concise summary and deferredItems.",
  ]
    .filter((section) => section.length > 0)
    .join("\n");
}

export function buildSystemPromptFrame(input: BuildSystemPromptInput): SystemPromptFrame {
  const staticSection = buildStaticSection(input.actionDefinitions ?? CORE_ACTIONS);
  const dynamicSection = buildDynamicSection(input);

  return {
    cacheBoundaryMarker: ANTHROPIC_CACHE_BOUNDARY_MARKER,
    dynamicSection,
    staticSection,
    system: [
      {
        cache_control: {
          type: "ephemeral",
        },
        text: `${staticSection}\n${ANTHROPIC_CACHE_BOUNDARY_MARKER}`,
        type: "text",
      },
      {
        text: dynamicSection,
        type: "text",
      },
    ],
  };
}
