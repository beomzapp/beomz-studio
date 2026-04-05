import { Sandbox, type ProcessInfo } from "e2b";

import type {
  PreviewRuntimeContract,
  PreviewSession,
  Project,
  StudioFile,
} from "@beomz-studio/contracts";

import { getPreviewRuntimeConfig } from "../config.js";
import { createRuntimeContract } from "../runtime/contract.js";
import {
  buildPreviewWorkspaceWrites,
  mergePreviewFiles,
} from "../runtime/files.js";

export interface CreatePreviewSessionInput {
  previewId: string;
  project: Pick<Project, "id" | "name" | "templateId">;
  generation: {
    id: string;
    files: readonly StudioFile[];
  };
  sandboxId?: string | null;
}

export interface CreatePreviewSessionResult {
  runtime: PreviewRuntimeContract;
  session: PreviewSession;
}

const PREVIEW_BOOT_TIMEOUT_MS = 120_000;

function isRunnerProcess(processInfo: ProcessInfo, runnerPath: string): boolean {
  const command = [processInfo.cmd, ...processInfo.args].join(" ");

  return command.includes(runnerPath) || command.includes("pnpm exec vite");
}

function isPreviewReadyLogLine(line: string): boolean {
  return line.includes("ready in") || line.includes("Local:");
}

async function connectOrCreateSandbox(input: CreatePreviewSessionInput) {
  const config = getPreviewRuntimeConfig();

  if (input.sandboxId) {
    try {
      const sandbox = await Sandbox.connect(input.sandboxId, {
        timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
      });
      await sandbox.setTimeout(config.E2B_PREVIEW_TIMEOUT_MS);
      return sandbox;
    } catch {
      // Fall through to a fresh sandbox if the old one cannot be resumed.
    }
  }

  return Sandbox.create(config.E2B_PREVIEW_TEMPLATE, {
    metadata: {
      generationId: input.generation.id,
      previewId: input.previewId,
      projectId: input.project.id,
      templateId: input.project.templateId,
    },
    timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
  });
}

function buildPreviewUrl(sandbox: Sandbox, port: number, entryPath: string): string {
  return new URL(entryPath, `https://${sandbox.getHost(port)}`).toString();
}

async function ensureRunner(sandbox: Sandbox): Promise<void> {
  const config = getPreviewRuntimeConfig();
  const processes = await sandbox.commands.list();

  if (processes.some((processInfo) => isRunnerProcess(processInfo, config.E2B_PREVIEW_RUNNER_PATH))) {
    return;
  }

  try {
    await sandbox.commands.run("which tsx && which pnpm && echo OK", {
      cwd: config.E2B_PREVIEW_WORKDIR,
      timeoutMs: 10_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown preview runner environment error.";
    throw new Error(`Preview runner prerequisites are unavailable in the sandbox: ${message}`);
  }

  const runnerLogs: string[] = [];
  let readyResolved = false;
  let runnerReady = false;
  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: Error) => void) | null = null;
  let bootTimeout: ReturnType<typeof setTimeout> | null = null;

  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = () => {
      if (!readyResolved) {
        readyResolved = true;
        runnerReady = true;
        resolve();
      }
    };
    rejectReady = (error) => {
      if (!readyResolved) {
        readyResolved = true;
        reject(error);
      }
    };
  });

  const runnerHandle = await sandbox.commands.run(
    `/usr/local/bin/tsx ${config.E2B_PREVIEW_RUNNER_PATH}`,
    {
      background: true,
      cwd: config.E2B_PREVIEW_WORKDIR,
      envs: {
        BEOMZ_PREVIEW_PORT: String(config.E2B_PREVIEW_PORT),
        BEOMZ_PREVIEW_WORKDIR: config.E2B_PREVIEW_WORKDIR,
      },
      onStdout: (line) => {
        runnerLogs.push(`[runner stdout] ${line}`);
        console.log("[runner stdout]", line);
        if (isPreviewReadyLogLine(line)) {
          resolveReady?.();
        }
      },
      onStderr: (line) => {
        runnerLogs.push(`[runner stderr] ${line}`);
        console.error("[runner stderr]", line);
      },
      timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
    },
  );

  void runnerHandle.wait().then((result) => {
    const exitMessage = `Preview runner exited before Vite became ready (exit ${result.exitCode ?? "unknown"}).`;
    console.error("[runner] process exited", { exitCode: result.exitCode });
    rejectReady?.(
      new Error(
        `${exitMessage} Logs:\n${runnerLogs.join("\n")}`,
      ),
    );
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown preview runner exit error.";
    rejectReady?.(
      new Error(`Preview runner failed before Vite became ready: ${message}\n${runnerLogs.join("\n")}`),
    );
  });

  try {
    await Promise.race([
      readyPromise,
      new Promise<never>((_, reject) => {
        bootTimeout = setTimeout(async () => {
          await runnerHandle.kill().catch(() => false);
          reject(
            new Error(
              `Preview runner did not report readiness within ${PREVIEW_BOOT_TIMEOUT_MS}ms. Logs:\n${runnerLogs.join("\n")}`,
            ),
          );
        }, PREVIEW_BOOT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (bootTimeout) {
      clearTimeout(bootTimeout);
    }
    if (!runnerReady) {
      await runnerHandle.disconnect();
    }
  }
}

async function writePreviewWorkspace(
  sandbox: Sandbox,
  runtime: PreviewRuntimeContract,
  files: readonly StudioFile[],
): Promise<void> {
  const config = getPreviewRuntimeConfig();
  const writes = buildPreviewWorkspaceWrites({
    files,
    runtime,
    workdir: config.E2B_PREVIEW_WORKDIR,
  });

  await sandbox.files.write(writes);
}

export async function createPreviewSession(
  input: CreatePreviewSessionInput,
): Promise<CreatePreviewSessionResult> {
  const config = getPreviewRuntimeConfig();
  const sessionBase = {
    createdAt: new Date().toISOString(),
    entryPath: "/",
    id: input.previewId,
    projectId: input.project.id,
    provider: "e2b",
    status: "booting",
  } satisfies PreviewSession;

  const sandbox = await connectOrCreateSandbox(input);
  const provisionalSession = {
    ...sessionBase,
    entryPath: input.project.templateId === "marketing-website"
      ? "/"
      : input.project.templateId === "saas-dashboard"
        ? "/app"
        : "/workspace",
    sandboxId: sandbox.sandboxId,
  } satisfies PreviewSession;

  const runtime = createRuntimeContract({
    mode: "preview",
    project: input.project,
    provider: "e2b",
    session: provisionalSession,
  });
  const files = mergePreviewFiles(runtime, input.generation.files);

  await writePreviewWorkspace(sandbox, runtime, files);
  await ensureRunner(sandbox);

  const previewUrl = buildPreviewUrl(sandbox, config.E2B_PREVIEW_PORT, runtime.entryPath);

  const sandboxInfo = await sandbox.getInfo();

  return {
    runtime,
    session: {
      ...provisionalSession,
      createdAt: sandboxInfo.startedAt.toISOString(),
      entryPath: runtime.entryPath,
      expiresAt: sandboxInfo.endAt.toISOString(),
      status: "running",
      url: previewUrl,
    },
  };
}
