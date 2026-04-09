import type { InitialBuildPlan, TemplateSelectionResult } from "@beomz-studio/contracts";
export declare function selectInitialBuildTemplate(input: {
    prompt: string;
    plan?: InitialBuildPlan;
}): TemplateSelectionResult;
