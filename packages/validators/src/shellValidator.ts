import type { ShellViolation, ValidationResult } from "./types.js";

/**
 * Known kernel file paths that must never be modified by AI output.
 * These are the canonical files in packages/kernel/src/.
 */
const KERNEL_FILES = [
  "packages/kernel/src/index.ts",
  "packages/kernel/src/auth/AuthGate.tsx",
  "packages/kernel/src/data/appDataAdapter.ts",
  "packages/kernel/src/nav/navRegistry.ts",
  "packages/kernel/src/preview/previewBootstrap.ts",
  "packages/kernel/src/publish/publishBootstrap.ts",
  "packages/kernel/src/routing/routeRegistry.ts",
  "packages/kernel/src/shell/AppShell.tsx",
  "packages/kernel/src/shell/DashboardShell.tsx",
  "packages/kernel/src/shell/WebsiteShell.tsx",
  "packages/kernel/src/shell/WorkspaceShell.tsx",
  "packages/kernel/src/uploads/uploadAdapter.ts",
  "packages/kernel/package.json",
  "packages/kernel/tsconfig.json",
];

/**
 * Validates that no kernel files were modified or deleted.
 * Returns violations for any AI output that touches kernel paths.
 */
export function validateShellIntegrity(
  modifiedPaths: string[]
): { valid: boolean; violations: ShellViolation[] } {
  const violations: ShellViolation[] = [];

  for (const path of modifiedPaths) {
    // Check exact kernel file matches
    if (KERNEL_FILES.includes(path)) {
      violations.push({
        path,
        reason: `Direct modification of frozen kernel file: ${path}`,
      });
      continue;
    }

    // Check any path under packages/kernel/
    if (path.startsWith("packages/kernel/")) {
      violations.push({
        path,
        reason: `File created or modified inside frozen kernel directory`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Converts shell violations to a standard ValidationResult.
 */
export function shellValidationResult(
  modifiedPaths: string[]
): ValidationResult {
  const { valid, violations } = validateShellIntegrity(modifiedPaths);
  return {
    valid,
    errors: violations.map(
      (v) => `SHELL_VIOLATION: ${v.path} — ${v.reason}`
    ),
    warnings: [],
  };
}
