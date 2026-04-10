import {
  buildGeneratedAppShellPath,
  buildGeneratedDataFilePath,
  buildGeneratedManifestPath,
  buildGeneratedNavigationFilePath,
  buildGeneratedPageFilePath,
  buildGeneratedThemeFilePath,
  buildGeneratedUiComponentPath,
  buildGeneratedUtilsPath,
} from "@beomz-studio/contracts";

import type { ValidationResult } from "./types.js";

const KERNEL_PATHS = ["packages/kernel/"];

const REQUIRED_FILES_BY_TEMPLATE: Record<string, string[]> = {
  "marketing-website": [
    buildGeneratedManifestPath("marketing-website"),
    buildGeneratedThemeFilePath("marketing-website"),
    buildGeneratedDataFilePath("marketing-website"),
    buildGeneratedNavigationFilePath("marketing-website"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("marketing-website"),
    buildGeneratedUiComponentPath("marketing-website", "PrimaryButton"),
    buildGeneratedUiComponentPath("marketing-website", "SurfaceCard"),
    buildGeneratedPageFilePath("marketing-website", "home"),
  ],
  "saas-dashboard": [
    buildGeneratedManifestPath("saas-dashboard"),
    buildGeneratedThemeFilePath("saas-dashboard"),
    buildGeneratedDataFilePath("saas-dashboard"),
    buildGeneratedNavigationFilePath("saas-dashboard"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("saas-dashboard"),
    buildGeneratedUiComponentPath("saas-dashboard", "PrimaryButton"),
    buildGeneratedUiComponentPath("saas-dashboard", "SurfaceCard"),
    buildGeneratedPageFilePath("saas-dashboard", "overview"),
  ],
  "workspace-task": [
    buildGeneratedManifestPath("workspace-task"),
    buildGeneratedThemeFilePath("workspace-task"),
    buildGeneratedDataFilePath("workspace-task"),
    buildGeneratedNavigationFilePath("workspace-task"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("workspace-task"),
    buildGeneratedUiComponentPath("workspace-task", "PrimaryButton"),
    buildGeneratedUiComponentPath("workspace-task", "SurfaceCard"),
    buildGeneratedPageFilePath("workspace-task", "tasks"),
  ],
  "mobile-app": [
    buildGeneratedManifestPath("mobile-app"),
    buildGeneratedThemeFilePath("mobile-app"),
    buildGeneratedDataFilePath("mobile-app"),
    buildGeneratedNavigationFilePath("mobile-app"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("mobile-app"),
    buildGeneratedUiComponentPath("mobile-app", "PrimaryButton"),
    buildGeneratedUiComponentPath("mobile-app", "SurfaceCard"),
    buildGeneratedPageFilePath("mobile-app", "home"),
  ],
  "social-app": [
    buildGeneratedManifestPath("social-app"),
    buildGeneratedThemeFilePath("social-app"),
    buildGeneratedDataFilePath("social-app"),
    buildGeneratedNavigationFilePath("social-app"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("social-app"),
    buildGeneratedUiComponentPath("social-app", "PrimaryButton"),
    buildGeneratedUiComponentPath("social-app", "SurfaceCard"),
    buildGeneratedPageFilePath("social-app", "feed"),
  ],
  "ecommerce": [
    buildGeneratedManifestPath("ecommerce"),
    buildGeneratedThemeFilePath("ecommerce"),
    buildGeneratedDataFilePath("ecommerce"),
    buildGeneratedNavigationFilePath("ecommerce"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("ecommerce"),
    buildGeneratedUiComponentPath("ecommerce", "PrimaryButton"),
    buildGeneratedUiComponentPath("ecommerce", "SurfaceCard"),
    buildGeneratedPageFilePath("ecommerce", "home"),
  ],
  "portfolio": [
    buildGeneratedManifestPath("portfolio"),
    buildGeneratedThemeFilePath("portfolio"),
    buildGeneratedDataFilePath("portfolio"),
    buildGeneratedNavigationFilePath("portfolio"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("portfolio"),
    buildGeneratedUiComponentPath("portfolio", "PrimaryButton"),
    buildGeneratedUiComponentPath("portfolio", "SurfaceCard"),
    buildGeneratedPageFilePath("portfolio", "home"),
  ],
  "blog-cms": [
    buildGeneratedManifestPath("blog-cms"),
    buildGeneratedThemeFilePath("blog-cms"),
    buildGeneratedDataFilePath("blog-cms"),
    buildGeneratedNavigationFilePath("blog-cms"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("blog-cms"),
    buildGeneratedUiComponentPath("blog-cms", "PrimaryButton"),
    buildGeneratedUiComponentPath("blog-cms", "SurfaceCard"),
    buildGeneratedPageFilePath("blog-cms", "articles"),
  ],
  "onboarding-flow": [
    buildGeneratedManifestPath("onboarding-flow"),
    buildGeneratedThemeFilePath("onboarding-flow"),
    buildGeneratedDataFilePath("onboarding-flow"),
    buildGeneratedNavigationFilePath("onboarding-flow"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("onboarding-flow"),
    buildGeneratedUiComponentPath("onboarding-flow", "PrimaryButton"),
    buildGeneratedUiComponentPath("onboarding-flow", "SurfaceCard"),
    buildGeneratedPageFilePath("onboarding-flow", "welcome"),
  ],
  "data-table-app": [
    buildGeneratedManifestPath("data-table-app"),
    buildGeneratedThemeFilePath("data-table-app"),
    buildGeneratedDataFilePath("data-table-app"),
    buildGeneratedNavigationFilePath("data-table-app"),
    buildGeneratedUtilsPath(),
    buildGeneratedAppShellPath("data-table-app"),
    buildGeneratedUiComponentPath("data-table-app", "PrimaryButton"),
    buildGeneratedUiComponentPath("data-table-app", "SurfaceCard"),
    buildGeneratedPageFilePath("data-table-app", "overview"),
  ],
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
    if (!files.some((f) => f === req || f.endsWith(req))) {
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
