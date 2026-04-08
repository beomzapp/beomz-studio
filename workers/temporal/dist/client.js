"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_ITERATION_WORKFLOW_TYPE = exports.INITIAL_BUILD_WORKFLOW_TYPE = void 0;
exports.buildInitialBuildWorkflowId = buildInitialBuildWorkflowId;
exports.buildProjectIterationWorkflowId = buildProjectIterationWorkflowId;
exports.getInitialBuildTaskQueue = getInitialBuildTaskQueue;
exports.getTemporalClient = getTemporalClient;
const client_1 = require("@temporalio/client");
const config_js_1 = require("./config.js");
exports.INITIAL_BUILD_WORKFLOW_TYPE = "initialBuildWorkflow";
exports.PROJECT_ITERATION_WORKFLOW_TYPE = "projectIterationWorkflow";
let cachedTemporalClientPromise = null;
function buildInitialBuildWorkflowId(buildId) {
    return `initial-build:${buildId}`;
}
function buildProjectIterationWorkflowId(buildId) {
    return `project-iteration:${buildId}`;
}
function getInitialBuildTaskQueue() {
    return (0, config_js_1.getTemporalRuntimeConfig)().TEMPORAL_TASK_QUEUE;
}
async function getTemporalClient() {
    if (!cachedTemporalClientPromise) {
        cachedTemporalClientPromise = (async () => {
            const config = (0, config_js_1.getTemporalRuntimeConfig)();
            const connection = await client_1.Connection.connect((0, config_js_1.getTemporalConnectionOptions)());
            return new client_1.Client({
                connection,
                namespace: config.TEMPORAL_NAMESPACE,
            });
        })();
    }
    return cachedTemporalClientPromise;
}
