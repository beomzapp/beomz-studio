import { Client, Connection } from "@temporalio/client";
import { getTemporalConnectionOptions, getTemporalRuntimeConfig } from "./config.js";
export const INITIAL_BUILD_WORKFLOW_TYPE = "initialBuildWorkflow";
export const PROJECT_ITERATION_WORKFLOW_TYPE = "projectIterationWorkflow";
let cachedTemporalClientPromise = null;
export function buildInitialBuildWorkflowId(buildId) {
    return `initial-build:${buildId}`;
}
export function buildProjectIterationWorkflowId(buildId) {
    return `project-iteration:${buildId}`;
}
export function getInitialBuildTaskQueue() {
    return getTemporalRuntimeConfig().TEMPORAL_TASK_QUEUE;
}
export async function getTemporalClient() {
    if (!cachedTemporalClientPromise) {
        cachedTemporalClientPromise = (async () => {
            const config = getTemporalRuntimeConfig();
            const connection = await Connection.connect(getTemporalConnectionOptions());
            return new Client({
                connection,
                namespace: config.TEMPORAL_NAMESPACE,
            });
        })();
    }
    return cachedTemporalClientPromise;
}
