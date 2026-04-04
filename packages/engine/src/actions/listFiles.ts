import { z } from "zod";

import type { ActionDefinition } from "./types.js";

const listFilesSchema = z
  .object({
    pattern: z.string().min(1).default("**/*"),
  })
  .strict();

export const listFilesAction = {
  concurrency: "read",
  description:
    "List virtual files that match a glob pattern. Use this to inspect the current workspace shape before making edits.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      pattern: {
        description: "Glob pattern to match against VFS paths, for example apps/web/src/**/*.tsx.",
        type: "string",
      },
    },
    required: ["pattern"],
    type: "object",
  },
  name: "listFiles",
  schema: listFilesSchema,
  execute(input, context) {
    const paths = context.vfs.list(input.pattern);

    return {
      output: {
        count: paths.length,
        paths,
        pattern: input.pattern,
      },
      summary: `Matched ${paths.length} file(s) for ${input.pattern}.`,
    };
  },
  undo() {
    // Non-destructive action.
  },
} satisfies ActionDefinition<typeof listFilesSchema>;
