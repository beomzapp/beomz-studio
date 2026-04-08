"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBuild = validateBuild;
const operations_1 = require("@beomz-studio/operations");
const minimatch_1 = require("minimatch");
const typescript_1 = __importDefault(require("typescript"));
const contracts_1 = require("@beomz-studio/contracts");
const paths_js_1 = require("../shared/paths.js");
const iterationContext_js_1 = require("../shared/iterationContext.js");
function matchesAnyGlob(filePath, globs) {
    return globs.some((glob) => (0, minimatch_1.minimatch)(filePath, glob, { dot: true }));
}
function createDiagnosticsForFile(filePath, content) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
        return [];
    }
    const result = typescript_1.default.transpileModule(content, {
        compilerOptions: {
            target: typescript_1.default.ScriptTarget.ES2022,
            module: typescript_1.default.ModuleKind.ESNext,
            jsx: typescript_1.default.JsxEmit.ReactJSX,
        },
        fileName: filePath,
        reportDiagnostics: true,
    });
    return (result.diagnostics ?? []).map((diagnostic) => ({
        code: "typescript-syntax",
        message: typescript_1.default.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        path: filePath,
        validationId: "typecheck-generated-surface",
    }));
}
function findShellDuplicationViolations(files) {
    return files
        .filter((file) => /\/app\/generated\/.+\.(tsx|jsx|ts|js)$/i.test(file.path))
        .filter((file) => /(function\s+(Sidebar|TopBar|BottomTab|BottomNav|DrawerMenu)\b|const\s+(Sidebar|TopBar|BottomTab|BottomNav|DrawerMenu)\s*=|<aside\b[\s\S]{0,400}<nav\b)/i.test(file.content))
        .map((file) => file.path);
}
async function validateBuild(input) {
    const errors = [];
    const warnings = [...input.draft.warnings];
    const isIteration = input.draft.changedPaths !== undefined && input.draft.changedPaths.length > 0;
    const normalizedFiles = input.draft.files.map((file) => ({
        ...file,
        path: (0, paths_js_1.normalizeGeneratedPath)(file.path),
    }));
    const seenPaths = new Set();
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
        if (!matchesAnyGlob(file.path, operations_1.initialBuildOperation.writeScope.allowedGlobs)) {
            errors.push({
                code: "write-scope-denied",
                message: "Generated file path falls outside the allowed initial build scope.",
                path: file.path,
                validationId: "allowed-scope-check",
            });
        }
        if (matchesAnyGlob(file.path, operations_1.initialBuildOperation.writeScope.deniedGlobs)) {
            errors.push({
                code: "denied-write-scope",
                message: "Generated file path matches a denied platform-owned scope.",
                path: file.path,
                validationId: "kernel-protection-check",
            });
        }
        if (matchesAnyGlob(file.path, operations_1.initialBuildOperation.writeScope.immutableGlobs)) {
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
    const expectedRoutePaths = (0, paths_js_1.buildExpectedGeneratedPaths)(input.template);
    const generatedPaths = new Set(normalizedFiles.map((file) => file.path));
    for (const expectedPath of expectedRoutePaths) {
        if (!generatedPaths.has(expectedPath)) {
            errors.push({
                code: "missing-required-page",
                message: `Missing required generated page for template route: ${expectedPath}`,
                path: expectedPath,
                validationId: "template-contract-check",
            });
        }
    }
    const manifest = (0, contracts_1.readGeneratedManifestFromFiles)(input.template.id, normalizedFiles)
        ?? (0, contracts_1.buildGeneratedManifest)(input.template);
    for (const route of manifest.routes) {
        const normalizedRoutePath = (0, paths_js_1.normalizeGeneratedPath)(route.filePath);
        if (!generatedPaths.has(normalizedRoutePath)) {
            errors.push({
                code: "missing-manifest-route",
                message: `Route manifest points to a missing generated route file: ${normalizedRoutePath}`,
                path: normalizedRoutePath,
                validationId: "template-contract-check",
            });
        }
    }
    const duplicateSemanticLabels = (0, iterationContext_js_1.findDuplicateSemanticNavLabels)(manifest.routes.filter((route) => route.inPrimaryNav).map((route) => route.label));
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
        errors.push({
            code: "preview-entry-mismatch",
            message: "Preview entry path does not match the selected template contract.",
            validationId: "template-contract-check",
        });
    }
    const unexpectedRouteFiles = normalizedFiles.filter((file) => file.kind === "route" && !manifest.routes.some((route) => (0, paths_js_1.normalizeGeneratedPath)(route.filePath) === file.path));
    if (unexpectedRouteFiles.length > 0) {
        warnings.push(`Additional route files were generated outside the required template set: ${unexpectedRouteFiles
            .map((file) => file.path)
            .join(", ")}`);
    }
    if (isIteration) {
        const iterationIntent = (0, iterationContext_js_1.classifyIterationIntent)(input.draft.summary);
        const forbiddenAuthNav = manifest.routes
            .filter((route) => route.inPrimaryNav)
            .map((route) => route.label)
            .filter((label) => ["login", "sign in", "signup", "sign up", "logout", "log out"].includes(label.toLowerCase()));
        if (iterationIntent === "auth_flow" && forbiddenAuthNav.length > 0) {
            errors.push({
                code: "auth-nav-leak",
                message: "Auth actions must not be added as primary navigation destinations.",
                validationId: "iteration-semantic-nav-check",
            });
        }
    }
    const outputPaths = Array.from(new Set(input.draft.changedPaths && input.draft.changedPaths.length > 0
        ? input.draft.changedPaths.map((filePath) => (0, paths_js_1.normalizeGeneratedPath)(filePath))
        : normalizedFiles.map((file) => file.path)));
    return {
        errors,
        files: errors.length === 0 ? normalizedFiles : [],
        outputPaths: errors.length === 0 ? outputPaths : [],
        passed: errors.length === 0,
        warnings,
    };
}
