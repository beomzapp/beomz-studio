import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as dotenvConfig } from "dotenv";

function shouldStartEmbeddedTemporalWorker(): boolean {
  if (process.env.BEOMZ_ENABLE_EMBEDDED_TEMPORAL_WORKER === "true") {
    return true;
  }

  if (process.env.BEOMZ_ENABLE_EMBEDDED_TEMPORAL_WORKER === "false") {
    return false;
  }

  return Boolean(
    process.env.RAILWAY_ENVIRONMENT
      || process.env.RAILWAY_ENVIRONMENT_ID
      || process.env.RAILWAY_PROJECT_ID
      || process.env.RAILWAY_SERVICE_ID,
  );
}

let workerProcess: ReturnType<typeof spawn> | null = null;
let shuttingDown = false;

function stopWorker(): void {
  if (workerProcess && !workerProcess.killed) {
    workerProcess.kill("SIGTERM");
  }
}

function wireShutdownSignals(): void {
  const handleSignal = (signal: NodeJS.Signals) => {
    shuttingDown = true;
    console.warn(`Beomz Studio API runtime received ${signal}. Shutting down embedded services.`);
    stopWorker();
    process.kill(process.pid, signal);
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  process.once("exit", stopWorker);
}

function assertRequiredStartupEnv(): void {
  if (!process.env.NEON_API_KEY?.trim()) {
    throw new Error("NEON_API_KEY is required at startup for managed Neon database operations.");
  }
}

async function main(): Promise<void> {
  // Load .env with an explicit path before the dynamic import of server.js.
  // All static imports in bootstrap (node built-ins + dotenv) are leaves with
  // no dependency on config.ts, so they evaluate first. The dotenvConfig() call
  // here runs before `await import("./server.js")`, meaning config.ts sees the
  // correct env values when it evaluates — regardless of pm2's saved env state.
  const _bootstrapDir = dirname(fileURLToPath(import.meta.url));
  dotenvConfig({ path: join(_bootstrapDir, "../.env"), override: true });
  assertRequiredStartupEnv();
  if (shouldStartEmbeddedTemporalWorker()) {
    const workerEntry = fileURLToPath(
      new URL("../../../workers/temporal/dist/worker.js", import.meta.url),
    );

    workerProcess = spawn(process.execPath, [workerEntry], {
      env: process.env,
      stdio: "inherit",
    });

    workerProcess.once("exit", (code, signal) => {
      workerProcess = null;

      if (shuttingDown) {
        return;
      }

      const detail =
        signal ? `signal ${signal}` : `code ${typeof code === "number" ? code : 1}`;
      console.error(`Embedded Temporal worker exited unexpectedly (${detail}).`);
      process.exit(typeof code === "number" ? code : 1);
    });

    console.log("Embedded Temporal worker started for Railway runtime.");
    wireShutdownSignals();
  }

  await import("./server.js");
}

main().catch((error) => {
  console.error("Failed to bootstrap Beomz Studio API runtime.", error);
  stopWorker();
  process.exit(1);
});
