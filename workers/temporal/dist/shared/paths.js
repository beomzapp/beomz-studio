export { buildGeneratedAppShellPath, buildGeneratedDataFilePath, buildGeneratedManifest, buildGeneratedManifestPath, buildGeneratedNavigationFilePath, buildGeneratedPageComponentName, buildGeneratedPageFilePath, buildGeneratedThemeFilePath, buildGeneratedUiComponentPath, buildGeneratedUtilsPath, buildRequiredGeneratedScaffoldPaths, normalizeGeneratedPath, } from "@beomz-studio/contracts";
import { buildGeneratedPageFilePath, buildRequiredGeneratedScaffoldPaths, } from "@beomz-studio/contracts";
export function buildExpectedGeneratedPaths(template) {
    return [
        ...buildRequiredGeneratedScaffoldPaths(template),
        ...template.pages.map((page) => buildGeneratedPageFilePath(template.id, page.id)),
    ];
}
