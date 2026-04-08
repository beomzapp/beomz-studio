import type { InitialBuildPlan, TemplateSelectionResult } from "./types.js";
export declare function selectInitialBuildTemplate(input: {
    prompt: string;
    plan?: InitialBuildPlan;
}): TemplateSelectionResult;
