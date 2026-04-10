import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname);
const LEGACY_TEMPLATE_NAME = "beomz-vite-react";
const TEMPLATE_CONTENT_PATHS = ["Dockerfile", "runner.ts", "workspace"] as const;

function normalizeRelativePath(filePath: string): string {
  return relative(TEMPLATE_ROOT, filePath).replaceAll("\\", "/");
}

function listTemplateFiles(entryPath: string): string[] {
  const stat = statSync(entryPath);
  if (stat.isFile()) {
    return [entryPath];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  return readdirSync(entryPath)
    .flatMap((entry) => listTemplateFiles(resolve(entryPath, entry)))
    .sort((left, right) => left.localeCompare(right));
}

function buildTemplateVersion(): string {
  const hash = createHash("sha256");
  const files = TEMPLATE_CONTENT_PATHS
    .flatMap((entry) => listTemplateFiles(resolve(TEMPLATE_ROOT, entry)))
    .sort((left, right) => left.localeCompare(right));

  for (const filePath of files) {
    hash.update(normalizeRelativePath(filePath));
    hash.update("\0");
    hash.update(readFileSync(filePath));
    hash.update("\0");
  }

  return hash.digest("hex").slice(0, 12);
}

export const VITE_REACT_TEMPLATE_VERSION = buildTemplateVersion();
export const DEFAULT_VITE_REACT_TEMPLATE_NAME =
  `${LEGACY_TEMPLATE_NAME}-${VITE_REACT_TEMPLATE_VERSION}`;

export function resolveViteReactTemplateName(
  configuredTemplateName?: string | null,
): string {
  const normalizedTemplateName = configuredTemplateName?.trim();

  if (!normalizedTemplateName || normalizedTemplateName === LEGACY_TEMPLATE_NAME) {
    return DEFAULT_VITE_REACT_TEMPLATE_NAME;
  }

  return normalizedTemplateName;
}
