import { FailureReason } from "@beomz-studio/validators";
import { z } from "zod";

import {
  type ActionDefinition,
  EngineActionError,
} from "./types.js";

const readFileSchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

export const readFileAction = {
  concurrency: "read",
  description:
    "Read the full contents of a file from the virtual file system without modifying anything.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      path: {
        description: "Workspace-relative file path to read from the VFS.",
        type: "string",
      },
    },
    required: ["path"],
    type: "object",
  },
  name: "readFile",
  schema: readFileSchema,
  execute(input, context) {
    const filePath = context.normalizePath(input.path);
    const content = context.vfs.read(filePath);

    if (content === undefined) {
      throw new EngineActionError(
        FailureReason.INVALID_OUTPUT,
        `Cannot read ${filePath} because it does not exist.`,
      );
    }

    return {
      output: {
        content,
        path: filePath,
      },
      summary: `Read ${filePath}.`,
    };
  },
  undo() {
    // Non-destructive action.
  },
} satisfies ActionDefinition<typeof readFileSchema>;
