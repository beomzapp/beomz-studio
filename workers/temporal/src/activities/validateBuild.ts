import { initialBuildOperation } from "@beomz-studio/operations";
import { minimatch } from "minimatch";
import ts from "typescript";
import {
  buildGeneratedManifest,
  readGeneratedManifestFromFiles,
} from "@beomz-studio/contracts";

import {
  buildExpectedGeneratedPaths,
  normalizeGeneratedPath,
} from "../shared/paths.js";
import {
  classifyIterationIntent,
  findDuplicateSemanticNavLabels,
} from "../shared/iterationContext.js";
import type {
  BuildValidationResult,
  ValidateBuildActivityInput,
  ValidationIssue,
} from "../shared/types.js";

function matchesAnyGlob(filePath: string, globs: readonly string[]): boolean {
  return globs.some((glob) => minimatch(filePath, glob, { dot: true }));
}

function createDiagnosticsForFile(
  filePath: string,
  content: string,
): readonly ValidationIssue[] {
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return [];
  }

  const result = ts.transpileModule(content, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });

  return (result.diagnostics ?? []).map((diagnostic) => ({
    code: "typescript-syntax",
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    path: filePath,
    validationId: "typecheck-generated-surface",
  }));
}

function findShellDuplicationViolations(files: readonly { path: string; content: string }[]): string[] {
  return files
    .filter((file) => /\/app\/generated\/.+\.(tsx|jsx|ts|js)$/i.test(file.path))
    .filter((file) =>
      /(function\s+(Sidebar|TopBar|BottomTab|BottomNav|DrawerMenu)\b|const\s+(Sidebar|TopBar|BottomTab|BottomNav|DrawerMenu)\s*=|<aside\b[\s\S]{0,400}<nav\b)/i.test(file.content),
    )
    .map((file) => file.path);
}

export async function validateBuild(
  input: ValidateBuildActivityInput,
): Promise<BuildValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings = [...input.draft.warnings];
  const isIteration = input.draft.changedPaths !== undefined && input.draft.changedPaths.length > 0;
  const normalizedFiles = input.draft.files.map((file) => ({
    ...file,
    path: normalizeGeneratedPath(file.path),
  }));

  const seenPaths = new Set<string>();

  for (const file of normalizedFiles) {
    if (file.path.startsWith("../") || file.path.includes("/../")) {
      errors.push({
        code: "path-traversal",
        message: "Generated file path attempted to escape the allowed scope.",
        path: file.path,
        validationId: "allowed-scope-check",
      });
    }

    if (seenPaths.has(file.path)) {
      errors.push({
        code: "duplicate-path",
        message: "Generated output contained duplicate file paths.",
        path: file.path,
        validationId: "allowed-scope-check",
      });
      continue;
    }

    seenPaths.add(file.path);

    if (!matchesAnyGlob(file.path, initialBuildOperation.writeScope.allowedGlobs)) {
      errors.push({
        code: "write-scope-denied",
        message: "Generated file path falls outside the allowed initial build scope.",
        path: file.path,
        validationId: "allowed-scope-check",
      });
    }

    if (matchesAnyGlob(file.path, initialBuildOperation.writeScope.deniedGlobs)) {
      errors.push({
        code: "denied-write-scope",
        message: "Generated file path matches a denied platform-owned scope.",
        path: file.path,
        validationId: "kernel-protection-check",
      });
    }

    if (matchesAnyGlob(file.path, initialBuildOperation.writeScope.immutableGlobs)) {
      errors.push({
        code: "immutable-write-scope",
        message: "Generated file path targets an immutable kernel scope.",
        path: file.path,
        validationId: "kernel-protection-check",
      });
    }

    if (file.content.trim().length === 0) {
      errors.push({
        code: "empty-file",
        message: "Generated file content was empty.",
        path: file.path,
        validationId: "typecheck-generated-surface",
      });
    }

    errors.push(...createDiagnosticsForFile(file.path, file.content));
  }

  const expectedRoutePaths = buildExpectedGeneratedPaths(input.template);
  const generatedPaths = new Set(normalizedFiles.map((file) => file.path));

  for (const expectedPath of expectedRoutePaths) {
    if (!generatedPaths.has(expectedPath)) {
      warnings.push(`Missing required generated page for template route: ${expectedPath}`);
    }
  }

  const manifest =
    readGeneratedManifestFromFiles(input.template.id, normalizedFiles)
    ?? buildGeneratedManifest(input.template);

  for (const route of manifest.routes) {
    const normalizedRoutePath = normalizeGeneratedPath(route.filePath);
    if (!generatedPaths.has(normalizedRoutePath)) {
      warnings.push(
        `Route manifest points to a missing generated route file: ${normalizedRoutePath}`,
      );
    }
  }

  const duplicateSemanticLabels = findDuplicateSemanticNavLabels(
    manifest.routes.filter((route) => route.inPrimaryNav).map((route) => route.label),
  );
  for (const duplicate of duplicateSemanticLabels) {
    errors.push({
      code: "duplicate-semantic-nav",
      message: `Navigation contains duplicate or overlapping destinations: ${duplicate}`,
      validationId: "iteration-semantic-nav-check",
    });
  }

  const shellDuplicationViolations = findShellDuplicationViolations(normalizedFiles);
  for (const path of shellDuplicationViolations) {
    errors.push({
      code: "shell-duplication",
      message: "Route file duplicates shell-owned navigation or layout chrome.",
      path,
      validationId: "iteration-shell-ownership-check",
    });
  }

  if (input.draft.previewEntryPath !== input.template.previewEntryPath) {
    warnings.push("Preview entry path does not match the selected template contract.");
  }

  const unexpectedRouteFiles = normalizedFiles.filter(
    (file) => file.kind === "route" && !manifest.routes.some((route) => normalizeGeneratedPath(route.filePath) === file.path),
  );
  if (unexpectedRouteFiles.length > 0) {
    warnings.push(
      `Additional route files were generated outside the required template set: ${unexpectedRouteFiles
        .map((file) => file.path)
        .join(", ")}`,
    );
  }

  if (isIteration) {
    const iterationIntent = classifyIterationIntent(input.draft.summary);
    const forbiddenAuthNav = manifest.routes
      .filter((route) => route.inPrimaryNav)
      .map((route) => route.label)
      .filter((label) =>
        ["login", "sign in", "signup", "sign up", "logout", "log out"].includes(label.toLowerCase()),
      );

    if (iterationIntent === "auth_flow" && forbiddenAuthNav.length > 0) {
      errors.push({
        code: "auth-nav-leak",
        message: "Auth actions must not be added as primary navigation destinations.",
        validationId: "iteration-semantic-nav-check",
      });
    }
  }

  const outputPaths = Array.from(
    new Set(
      input.draft.changedPaths && input.draft.changedPaths.length > 0
        ? input.draft.changedPaths.map((filePath) => normalizeGeneratedPath(filePath))
        : normalizedFiles.map((file) => file.path),
    ),
  );

  return {
    errors,
    files: errors.length === 0 ? normalizedFiles : [],
    outputPaths: errors.length === 0 ? outputPaths : [],
    passed: errors.length === 0,
    warnings,
  };
}
