import type { Project, StudioFile, TemplateDefinition } from "@beomz-studio/contracts";
export declare function buildGeneratedScaffoldFiles(input: {
    project: Pick<Project, "name">;
    template: TemplateDefinition;
}): readonly StudioFile[];
export declare function buildScaffoldPromptBlock(template: TemplateDefinition): string;
