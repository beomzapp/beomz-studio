import type { InitialBuildPlan } from "@beomz-studio/contracts";
export declare function buildProjectNameFromPrompt(prompt: string, fallbackName: string): string;
export declare function createInitialBuildPlan(prompt: string, projectName: string): InitialBuildPlan;
