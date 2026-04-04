import { FailureReason } from "@beomz-studio/validators";
import { z } from "zod";

import {
  type ActionDefinition,
  EngineActionError,
} from "./types.js";

const editFileSchema = z
  .object({
    path: z.string().min(1),
    unifiedDiff: z.string().min(1),
  })
  .strict();

export const editFileAction = {
  concurrency: "exclusive",
  description:
    "Edit an existing file by applying a unified diff patch. Use this for surgical changes instead of rewriting the full file.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      path: {
        description: "Workspace-relative file path inside the allowed write scope.",
        type: "string",
      },
      unifiedDiff: {
        description:
          "A unified diff patch to apply to the current file contents. The patch must match the current VFS file exactly.",
        type: "string",
      },
    },
    required: ["path", "unifiedDiff"],
    type: "object",
  },
  name: "editFile",
  schema: editFileSchema,
  execute(input, context) {
    const filePath = context.assertWriteAllowed(input.path);
    const previousContent = context.vfs.read(filePath);

    if (previousContent === undefined) {
      throw new EngineActionError(
        FailureReason.INVALID_OUTPUT,
        `Cannot edit ${filePath} because it does not exist.`,
      );
    }

    const nextContent = context.vfs.applyPatch(filePath, input.unifiedDiff);

    return {
      changedPaths: [filePath],
      output: {
        applied: true,
        bytes: Buffer.byteLength(nextContent, "utf8"),
        path: filePath,
      },
      summary: `Edited ${filePath}.`,
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
} satisfies ActionDefinition<typeof editFileSchema>;
