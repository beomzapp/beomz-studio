export { FailureReason } from "./types.js";
export type {
  BuildResult,
  ShellViolation,
  PreviewFailure,
  ValidationResult,
} from "./types.js";

export { validateInitialBuild } from "./initialBuildValidator.js";
export {
  validateShellIntegrity,
  shellValidationResult,
} from "./shellValidator.js";
export { validatePreview, previewValidationResult } from "./previewValidator.js";

export { getMarketingFallback } from "./fallbacks/marketingFallback.js";
export { getSaasFallback } from "./fallbacks/saasFallback.js";
export { getWorkspaceFallback } from "./fallbacks/workspaceFallback.js";

import { getMarketingFallback } from "./fallbacks/marketingFallback.js";
import { getSaasFallback } from "./fallbacks/saasFallback.js";
import { getWorkspaceFallback } from "./fallbacks/workspaceFallback.js";

/**
 * Returns the appropriate fallback scaffold for a given template ID.
 */
export function getFallbackForTemplate(
  templateId: string
): { path: string; content: string }[] {
  switch (templateId) {
    case "marketing-website":
    case "ecommerce":
    case "portfolio":
    case "blog-cms":
    case "onboarding-flow":
      return getMarketingFallback();
    case "saas-dashboard":
    case "data-table-app":
      return getSaasFallback();
    case "workspace-task":
    case "mobile-app":
    case "social-app":
      return getWorkspaceFallback();
    default:
      return getMarketingFallback();
  }
}
