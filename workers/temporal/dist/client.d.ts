import { Client } from "@temporalio/client";
export declare const INITIAL_BUILD_WORKFLOW_TYPE = "initialBuildWorkflow";
export declare const PROJECT_ITERATION_WORKFLOW_TYPE = "projectIterationWorkflow";
export declare function buildInitialBuildWorkflowId(buildId: string): string;
export declare function buildProjectIterationWorkflowId(buildId: string): string;
export declare function getInitialBuildTaskQueue(): string;
export declare function getTemporalClient(): Promise<Client>;
