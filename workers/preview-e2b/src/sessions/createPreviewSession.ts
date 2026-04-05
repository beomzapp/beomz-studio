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

const PREVIEW_BOOT_TIMEOUT_MS = 60_000;

function isRunnerProcess(processInfo: ProcessInfo, runnerPath: string): boolean {
  const command = [processInfo.cmd, ...processInfo.args].join(" ");

  return command.includes(runnerPath) || command.includes("pnpm exec vite");
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

async function waitForPreview(url: string): Promise<void> {
  const deadline = Date.now() + PREVIEW_BOOT_TIMEOUT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }

      lastError = new Error(`Preview responded with ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const message =
    lastError instanceof Error ? lastError.message : "Preview server never became reachable.";
  throw new Error(message);
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

  // Run tsx in the foreground for a short window so that any immediate startup
  // errors are streamed back to Railway logs.  We race it against a 5-second
  // timer: if it's still alive after 5 s we consider it healthy and move on.
  const runnerLogs: string[] = [];
  let runnerExitedEarly = false;

  const runnerPromise = sandbox.commands.run(
    `/usr/local/bin/tsx ${config.E2B_PREVIEW_RUNNER_PATH}`,
    {
      cwd: config.E2B_PREVIEW_WORKDIR,
      envs: {
        BEOMZ_PREVIEW_PORT: String(config.E2B_PREVIEW_PORT),
        BEOMZ_PREVIEW_WORKDIR: config.E2B_PREVIEW_WORKDIR,
      },
      onStdout: (line) => {
        runnerLogs.push(`[runner stdout] ${line}`);
        console.log("[runner stdout]", line);
      },
      onStderr: (line) => {
        runnerLogs.push(`[runner stderr] ${line}`);
        console.error("[runner stderr]", line);
      },
      timeoutMs: config.E2B_PREVIEW_TIMEOUT_MS,
    },
  ).then((result) => {
    runnerExitedEarly = true;
    console.error("[runner] process exited early", { exitCode: result.exitCode });
    return result;
  });

  // Wait 5 s — if runner exits before that, it failed immediately.
  await Promise.race([
    runnerPromise,
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);

  if (runnerExitedEarly) {
    throw new Error(
      `Preview runner exited immediately. Logs:\n${runnerLogs.join("\n")}`,
    );
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
  await waitForPreview(previewUrl);

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
