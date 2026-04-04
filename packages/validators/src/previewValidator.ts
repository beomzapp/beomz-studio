import type { PreviewFailure, ValidationResult } from "./types.js";

/**
 * Checks preview files for common issues that would prevent rendering.
 * Inspects file contents for broken imports, missing deps, and syntax issues.
 */
export function validatePreview(
  files: { path: string; content: string }[]
): { valid: boolean; failures: PreviewFailure[] } {
  const failures: PreviewFailure[] = [];

  const filePaths = new Set(files.map((f) => f.path));

  for (const file of files) {
    // Check for broken relative imports
    const importMatches = file.content.matchAll(
      /import\s+.*?from\s+['"](\.\.?\/[^'"]+)['"]/g
    );
    for (const match of importMatches) {
      const importPath = match[1];
      // Resolve relative to file's directory
      const dir = file.path.substring(0, file.path.lastIndexOf("/"));
      const resolved = resolveRelativePath(dir, importPath);
      // Check if the imported file exists (with common extensions)
      const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".css"];
      const found = extensions.some((ext) => filePaths.has(resolved + ext));
      if (!found) {
        failures.push({
          type: "broken_import",
          path: file.path,
          message: `Import '${importPath}' resolves to '${resolved}' which doesn't exist in the generated files`,
        });
      }
    }

    // Check for obvious syntax errors in TSX/TS files
    if (file.path.endsWith(".tsx") || file.path.endsWith(".ts")) {
      // Unmatched braces (simple check)
      const opens = (file.content.match(/{/g) || []).length;
      const closes = (file.content.match(/}/g) || []).length;
      if (Math.abs(opens - closes) > 2) {
        failures.push({
          type: "syntax_error",
          path: file.path,
          message: `Mismatched braces: ${opens} open vs ${closes} close`,
        });
      }

      // Check for empty component exports
      if (
        file.path.endsWith(".tsx") &&
        file.content.includes("export") &&
        !file.content.includes("return")
      ) {
        failures.push({
          type: "syntax_error",
          path: file.path,
          message: "TSX component has export but no return statement",
        });
      }
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}

/**
 * Converts preview failures to a standard ValidationResult.
 */
export function previewValidationResult(
  files: { path: string; content: string }[]
): ValidationResult {
  const { valid, failures } = validatePreview(files);
  return {
    valid,
    errors: failures.map(
      (f) => `PREVIEW_${f.type.toUpperCase()}: ${f.path} — ${f.message}`
    ),
    warnings: [],
  };
}

function resolveRelativePath(from: string, importPath: string): string {
  const parts = from.split("/");
  const importParts = importPath.split("/");

  for (const part of importParts) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  return parts.join("/");
}
