import { z } from "zod";

const previewEnvSchema = z.object({
  E2B_API_KEY: z.string().min(1).optional(),
  E2B_PREVIEW_PORT: z.coerce.number().int().positive().default(4173),
  E2B_PREVIEW_RUNNER_PATH: z.string().min(1).default("/opt/beomz/runner.ts"),
  E2B_PREVIEW_TEMPLATE: z.string().min(1).default("beomz-vite-react"),
  E2B_PREVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
  E2B_PREVIEW_WORKDIR: z.string().min(1).default("/workspace"),
});

export type PreviewRuntimeConfig = z.infer<typeof previewEnvSchema>;

export function getPreviewRuntimeConfig(): PreviewRuntimeConfig {
  return previewEnvSchema.parse(process.env);
}

export function isPreviewRuntimeConfigured(): boolean {
  return typeof process.env.E2B_API_KEY === "string" && process.env.E2B_API_KEY.length > 0;
}
