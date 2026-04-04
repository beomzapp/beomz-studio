import { FailureReason } from "@beomz-studio/validators";
import { z } from "zod";

import {
  type ActionDefinition,
  EngineActionError,
} from "./types.js";

const createFileSchema = z
  .object({
    content: z.string(),
    path: z.string().min(1),
  })
  .strict();

export const createFileAction = {
  concurrency: "exclusive",
  description:
    "Create a brand new file in the virtual file system. Use this only for paths that do not already exist.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      content: {
        description: "The complete file contents to write.",
        type: "string",
      },
      path: {
        description: "Workspace-relative file path inside the allowed write scope.",
        type: "string",
      },
    },
    required: ["path", "content"],
    type: "object",
  },
  name: "createFile",
  schema: createFileSchema,
  execute(input, context) {
    const filePath = context.assertWriteAllowed(input.path);
    if (context.vfs.has(filePath)) {
      throw new EngineActionError(
        FailureReason.INVALID_OUTPUT,
        `Cannot create ${filePath} because it already exists.`,
      );
    }

    context.vfs.write(filePath, input.content);

    return {
      changedPaths: [filePath],
      output: {
        bytes: Buffer.byteLength(input.content, "utf8"),
        created: true,
        path: filePath,
      },
      summary: `Created ${filePath}.`,
      undoData: {
        path: filePath,
      },
    };
  },
  undo(outcome, context) {
    const pathToDelete = (outcome.undoData as { path: string } | undefined)?.path;
    if (!pathToDelete) {
      return;
    }

    context.vfs.delete(pathToDelete);
  },
} satisfies ActionDefinition<typeof createFileSchema>;
