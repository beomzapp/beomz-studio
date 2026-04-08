import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/index.js";
import { getTemporalNativeConnectionOptions, getTemporalRuntimeConfig, } from "./config.js";
async function main() {
    const temporalConfig = getTemporalRuntimeConfig();
    const connection = await NativeConnection.connect(getTemporalNativeConnectionOptions());
    const worker = await Worker.create({
        activities,
        connection,
        namespace: temporalConfig.TEMPORAL_NAMESPACE,
        taskQueue: temporalConfig.TEMPORAL_TASK_QUEUE,
        workflowsPath: fileURLToPath(new URL("./workflows/index.js", import.meta.url)),
    });
    await worker.run();
}
main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Temporal worker failed to start.", error);
    process.exit(1);
});
