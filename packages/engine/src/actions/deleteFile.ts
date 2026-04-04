import { FailureReason } from "@beomz-studio/validators";
import { z } from "zod";

import {
  type ActionDefinition,
  EngineActionError,
} from "./types.js";

const deleteFileSchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

export const deleteFileAction = {
  concurrency: "exclusive",
  description:
    "Delete a file from the virtual file system. Only use this when the file is no longer required.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      path: {
        description: "Workspace-relative file path inside the allowed write scope.",
        type: "string",
      },
    },
    required: ["path"],
    type: "object",
  },
  name: "deleteFile",
  schema: deleteFileSchema,
  execute(input, context) {
    const filePath = context.assertWriteAllowed(input.path);
    const previousContent = context.vfs.read(filePath);

    if (previousContent === undefined) {
      throw new EngineActionError(
        FailureReason.INVALID_OUTPUT,
        `Cannot delete ${filePath} because it does not exist.`,
      );
    }

    context.vfs.delete(filePath);

    return {
      changedPaths: [filePath],
      output: {
        deleted: true,
        path: filePath,
      },
      summary: `Deleted ${filePath}.`,
      undoData: {
        path: filePath,
        previousContent,
      },
    };
  },
  undo(outcome, context) {
    const undoData = outcome.undoData as
      | {
          path: string;
          previousContent: string;
        }
      | undefined;

    if (!undoData) {
      return;
    }

    context.vfs.write(undoData.path, undoData.previousContent);
  },
} satisfies ActionDefinition<typeof deleteFileSchema>;
