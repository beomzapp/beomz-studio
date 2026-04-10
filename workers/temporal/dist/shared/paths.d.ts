export { buildGeneratedAppShellPath, buildGeneratedDataFilePath, buildGeneratedManifest, buildGeneratedManifestPath, buildGeneratedNavigationFilePath, buildGeneratedPageComponentName, buildGeneratedPageFilePath, buildGeneratedThemeFilePath, buildGeneratedUiComponentPath, buildGeneratedUtilsPath, buildRequiredGeneratedScaffoldPaths, normalizeGeneratedPath, } from "@beomz-studio/contracts";
import type { TemplateDefinition } from "@beomz-studio/contracts";
export declare function buildExpectedGeneratedPaths(template: TemplateDefinition): readonly string[];
