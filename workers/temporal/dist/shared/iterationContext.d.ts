import type { GeneratedAppManifest, StudioFile, TemplateDefinition } from "@beomz-studio/contracts";
export type IterationIntent = "auth_flow" | "new_page" | "ui_polish" | "db_wiring" | "general_edit";
export interface LayoutFingerprint {
    shell: TemplateDefinition["shell"];
    entryPath: string;
    navLabels: readonly string[];
    routePaths: readonly string[];
    shellOwnedPaths: readonly string[];
}
export declare function classifyIterationIntent(prompt: string): IterationIntent;
export declare function getManifestFromFiles(template: TemplateDefinition, files: readonly Pick<StudioFile, "path" | "content">[]): GeneratedAppManifest;
export declare function buildLayoutFingerprint(template: TemplateDefinition, files: readonly Pick<StudioFile, "path" | "content">[]): LayoutFingerprint;
export declare function buildIterationPromptBlock(input: {
    fingerprint: LayoutFingerprint;
    intent: IterationIntent;
}): string;
export declare function normalizeSemanticNavLabel(label: string): string;
export declare function findDuplicateSemanticNavLabels(labels: readonly string[]): readonly string[];
