import type { InitialBuildWorkflowInput, InitialBuildWorkflowResult } from "../shared/types.js";
export declare function initialBuildWorkflow(input: InitialBuildWorkflowInput): Promise<InitialBuildWorkflowResult>;
export declare function projectIterationWorkflow(input: InitialBuildWorkflowInput): Promise<InitialBuildWorkflowResult>;
