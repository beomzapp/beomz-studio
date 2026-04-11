import type { ColorPalette, Project, StudioFile, TemplateDefinition } from "@beomz-studio/contracts";
export declare function buildGeneratedScaffoldFiles(input: {
    project: Pick<Project, "name">;
    template: TemplateDefinition;
    colorPalette?: ColorPalette;
}): readonly StudioFile[];
export declare function buildScaffoldPromptBlock(template: TemplateDefinition, colorPalette?: ColorPalette): string;
