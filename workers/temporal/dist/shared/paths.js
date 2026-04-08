"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeGeneratedPath = exports.buildRequiredGeneratedScaffoldPaths = exports.buildGeneratedUiComponentPath = exports.buildGeneratedThemeFilePath = exports.buildGeneratedPageFilePath = exports.buildGeneratedPageComponentName = exports.buildGeneratedNavigationFilePath = exports.buildGeneratedManifestPath = exports.buildGeneratedManifest = exports.buildGeneratedDataFilePath = exports.buildGeneratedAppShellPath = void 0;
exports.buildExpectedGeneratedPaths = buildExpectedGeneratedPaths;
var contracts_1 = require("@beomz-studio/contracts");
Object.defineProperty(exports, "buildGeneratedAppShellPath", { enumerable: true, get: function () { return contracts_1.buildGeneratedAppShellPath; } });
Object.defineProperty(exports, "buildGeneratedDataFilePath", { enumerable: true, get: function () { return contracts_1.buildGeneratedDataFilePath; } });
Object.defineProperty(exports, "buildGeneratedManifest", { enumerable: true, get: function () { return contracts_1.buildGeneratedManifest; } });
Object.defineProperty(exports, "buildGeneratedManifestPath", { enumerable: true, get: function () { return contracts_1.buildGeneratedManifestPath; } });
Object.defineProperty(exports, "buildGeneratedNavigationFilePath", { enumerable: true, get: function () { return contracts_1.buildGeneratedNavigationFilePath; } });
Object.defineProperty(exports, "buildGeneratedPageComponentName", { enumerable: true, get: function () { return contracts_1.buildGeneratedPageComponentName; } });
Object.defineProperty(exports, "buildGeneratedPageFilePath", { enumerable: true, get: function () { return contracts_1.buildGeneratedPageFilePath; } });
Object.defineProperty(exports, "buildGeneratedThemeFilePath", { enumerable: true, get: function () { return contracts_1.buildGeneratedThemeFilePath; } });
Object.defineProperty(exports, "buildGeneratedUiComponentPath", { enumerable: true, get: function () { return contracts_1.buildGeneratedUiComponentPath; } });
Object.defineProperty(exports, "buildRequiredGeneratedScaffoldPaths", { enumerable: true, get: function () { return contracts_1.buildRequiredGeneratedScaffoldPaths; } });
Object.defineProperty(exports, "normalizeGeneratedPath", { enumerable: true, get: function () { return contracts_1.normalizeGeneratedPath; } });
const contracts_2 = require("@beomz-studio/contracts");
function buildExpectedGeneratedPaths(template) {
    return [
        ...(0, contracts_2.buildRequiredGeneratedScaffoldPaths)(template),
        ...template.pages.map((page) => (0, contracts_2.buildGeneratedPageFilePath)(template.id, page.id)),
    ];
}
