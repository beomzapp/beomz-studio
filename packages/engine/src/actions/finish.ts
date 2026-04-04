import { z } from "zod";

import type {
  ActionDefinition,
  FinishActionOutput,
} from "./types.js";

const finishSchema = z
  .object({
    deferredItems: z.array(z.string().min(1)).default([]),
    summary: z.string().min(1).max(1000),
  })
  .strict();

export const finishAction = {
  concurrency: "exclusive",
  description:
    "Signal that generation is complete. Always include a concise summary and any deferred items that should feed the continuation card.",
  jsonSchema: {
    additionalProperties: false,
    properties: {
      deferredItems: {
        description:
          "A flat list of concrete follow-up items that were intentionally deferred and should surface in the continuation card.",
        items: {
          type: "string",
        },
        type: "array",
      },
      summary: {
        description: "A concise summary of what the generation accomplished.",
        type: "string",
      },
    },
    required: ["summary", "deferredItems"],
    type: "object",
  },
  name: "finish",
  schema: finishSchema,
  execute(input) {
    const finish: FinishActionOutput = {
      deferredItems: input.deferredItems,
      summary: input.summary,
    };

    return {
      finish,
      output: finish,
      summary: "Generation finished.",
    };
  },
  undo() {
    // finish is terminal metadata, not a VFS mutation.
  },
} satisfies ActionDefinition<typeof finishSchema>;
