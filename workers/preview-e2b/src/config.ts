import { z } from "zod";

import { resolveViteReactTemplateName } from "./templates/vite-react/templateVersion.js";

const previewEnvSchema = z.object({
  E2B_API_KEY: z.string().min(1).optional(),
  E2B_PREVIEW_PORT: z.coerce.number().int().positive().default(4173),
  E2B_PREVIEW_RUNNER_PATH: z.string().min(1).default("/opt/beomz/runner.ts"),
  E2B_PREVIEW_TEMPLATE: z.string().min(1).optional(),
  E2B_PREVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
  E2B_PREVIEW_WORKDIR: z.string().min(1).default("/workspace"),
});

export interface PreviewRuntimeConfig {
  E2B_API_KEY?: string;
  E2B_PREVIEW_PORT: number;
  E2B_PREVIEW_RUNNER_PATH: string;
  E2B_PREVIEW_TEMPLATE: string;
  E2B_PREVIEW_TIMEOUT_MS: number;
  E2B_PREVIEW_WORKDIR: string;
}

export function getPreviewRuntimeConfig(): PreviewRuntimeConfig {
  const parsed = previewEnvSchema.parse(process.env);

  return {
    ...parsed,
    E2B_PREVIEW_TEMPLATE: resolveViteReactTemplateName(parsed.E2B_PREVIEW_TEMPLATE),
  };
}

export function isPreviewRuntimeConfigured(): boolean {
  return typeof process.env.E2B_API_KEY === "string" && process.env.E2B_API_KEY.length > 0;
}
