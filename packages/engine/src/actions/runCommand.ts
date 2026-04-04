import { FailureReason } from "@beomz-studio/validators";
import { z } from "zod";

import {
  type ActionDefinition,
  EngineActionError,
} from "./types.js";

const runCommandSchema = z
  .object({
    command: z.string().min(1),
    cwd: z.string().min(1).optional(),
    timeoutMs: z.number().int().positive().max(300_000).optional(),
  })
  .strict();

export const runCommandAction = {
  concurrency: "exclusive",
  description:
    "Run a validation or inspection command against a sandbox mounted from the current VFS snapshot. Sandbox file mutations do not persist back to the VFS.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      command: {
        description: "Shell command to execute inside the sandbox.",
        type: "string",
      },
      cwd: {
        description: "Optional workspace-relative working directory inside the sandbox.",
        type: "string",
      },
      timeoutMs: {
        description: "Optional timeout in milliseconds, capped at 300000.",
        type: "number",
      },
    },
    required: ["command"],
    type: "object",
  },
  name: "runCommand",
  schema: runCommandSchema,
  async execute(input, context) {
    if (!context.commandRunner) {
      throw new EngineActionError(
        FailureReason.PREVIEW_FAILED,
        "No sandbox command runner is configured for runCommand.",
      );
    }

    const cwd = input.cwd ? context.normalizePath(input.cwd) : undefined;
    const result = await context.commandRunner.run({
      command: input.command,
      cwd,
      snapshot: context.vfs.snapshot(),
      timeoutMs: input.timeoutMs,
    });

    return {
      output: {
        command: input.command,
        cwd,
        ...result,
      },
      summary: `Ran command: ${input.command}.`,
    };
  },
  undo() {
    // Sandbox command execution is non-persistent by design.
  },
} satisfies ActionDefinition<typeof runCommandSchema>;
