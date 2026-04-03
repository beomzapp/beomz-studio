import path from "node:path";

import type { TemplateDefinition, TemplateId } from "@beomz-studio/contracts";

export function normalizeGeneratedPath(filePath: string): string {
  return path.posix.normalize(filePath.replaceAll("\\", "/")).replace(/^\.\//, "");
}

export function buildGeneratedPageFilePath(templateId: TemplateId, pageId: string): string {
  return `apps/web/src/app/generated/${templateId}/${pageId}.tsx`;
}

export function buildExpectedGeneratedPaths(template: TemplateDefinition): readonly string[] {
  return template.pages.map((page) => buildGeneratedPageFilePath(template.id, page.id));
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

export function buildGeneratedPageComponentName(templateId: TemplateId, pageId: string): string {
  return `Generated${toPascalCase(templateId)}${toPascalCase(pageId)}Page`;
}
