import type { StudioFile } from "@beomz-studio/contracts";

import type { ValidationResult } from "./types.js";

export const APPROVED_GENERATED_IMPORTS = [
  "clsx",
  "framer-motion",
  "lucide-react",
  "react",
  "react-dom",
  "react-router-dom",
  "tailwind-merge",
] as const;

const approvedGeneratedImports = new Set<string>(APPROVED_GENERATED_IMPORTS);

const bannedImportPatterns = [
  /^react-icons(?:\/|$)/,
  /^@heroicons(?:\/|$)/,
  // Drag-and-drop libraries — not available in the sandbox.
  // Implement drag-and-drop using CSS pointer events and useState instead.
  /^@hello-pangea\/dnd(?:\/|$)/,
  /^@dnd-kit\/(?:core|sortable|utilities|modifiers|accessibility)(?:\/|$)/,
  /^react-beautiful-dnd(?:\/|$)/,
] as const;

function isBareModuleSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("@/");
}

function isGeneratedTsxSurfaceFile(file: StudioFile): boolean {
  return (
    file.language === "tsx"
    && (
      file.path.startsWith("apps/web/src/app/generated/")
      || file.path.startsWith("apps/web/src/components/generated/")
    )
  );
}

function extractModuleSpecifiers(content: string): string[] {
  const matches = content.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g);
  return [...matches].map((match) => match[1] ?? "").filter((specifier) => specifier.length > 0);
}

function hasDefaultExport(content: string): boolean {
  return /export\s+default\b/.test(content);
}

export function validateGeneratedFileGuardrails(files: readonly StudioFile[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    if (isGeneratedTsxSurfaceFile(file) && !hasDefaultExport(file.content)) {
      errors.push(`Generated TSX file is missing a default export: ${file.path}`);
    }

    for (const specifier of extractModuleSpecifiers(file.content)) {
      if (!isBareModuleSpecifier(specifier)) {
        continue;
      }

      if (bannedImportPatterns.some((pattern) => pattern.test(specifier))) {
        errors.push(`Generated file imports a banned package (${specifier}) in ${file.path}`);
        continue;
      }

      if (!approvedGeneratedImports.has(specifier)) {
        errors.push(
          `Generated file imports an unavailable sandbox package (${specifier}) in ${file.path}. Approved packages: ${APPROVED_GENERATED_IMPORTS.join(", ")}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
