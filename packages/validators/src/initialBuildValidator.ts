import type { ValidationResult } from "./types.js";

const KERNEL_PATHS = ["packages/kernel/"];

const REQUIRED_FILES_BY_TEMPLATE: Record<string, string[]> = {
  "marketing-website": ["src/pages/Home.tsx"],
  "saas-dashboard": ["src/pages/Overview.tsx"],
  "workspace-task": ["src/pages/Tasks.tsx"],
  "mobile-app": ["src/pages/Home.tsx"],
  "social-app": ["src/pages/Feed.tsx"],
  "ecommerce": ["src/pages/Home.tsx"],
  "portfolio": ["src/pages/Home.tsx"],
  "blog-cms": ["src/pages/Articles.tsx"],
  "onboarding-flow": ["src/pages/Welcome.tsx"],
  "data-table-app": ["src/pages/Overview.tsx"],
};

/**
 * Validates AI-generated output against the operation contract.
 * Checks:
 * 1. Files are within allowed write scope
 * 2. No kernel paths were touched
 * 3. Required files exist for the template
 */
export function validateInitialBuild(
  files: string[],
  templateId: string,
  allowedGlobs: string[] = ["src/**", "public/**"],
  deniedGlobs: string[] = ["packages/kernel/**", "node_modules/**"]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check no kernel paths touched
  for (const file of files) {
    for (const kernelPath of KERNEL_PATHS) {
      if (file.startsWith(kernelPath)) {
        errors.push(`Kernel file modified: ${file} — kernel is immutable`);
      }
    }
  }

  // Check denied globs
  for (const file of files) {
    for (const denied of deniedGlobs) {
      const prefix = denied.replace("/**", "/");
      if (file.startsWith(prefix)) {
        errors.push(`File in denied scope: ${file} (denied by ${denied})`);
      }
    }
  }

  // Check allowed globs
  for (const file of files) {
    const inAllowed = allowedGlobs.some((glob) => {
      const prefix = glob.replace("/**", "/");
      return file.startsWith(prefix);
    });
    if (!inAllowed) {
      warnings.push(`File outside allowed scope: ${file}`);
    }
  }

  // Check required files
  const required = REQUIRED_FILES_BY_TEMPLATE[templateId] ?? [];
  for (const req of required) {
    if (!files.some((f) => f.endsWith(req))) {
      errors.push(`Required file missing: ${req} (template: ${templateId})`);
    }
  }

  // Warn if very few files generated
  if (files.length === 0) {
    errors.push("No files generated");
  } else if (files.length < 3) {
    warnings.push(`Only ${files.length} file(s) generated — may be incomplete`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
