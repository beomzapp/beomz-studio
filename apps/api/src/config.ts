import { z } from "zod";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  PLATFORM_JWKS_URL: z
    .string()
    .url()
    .default(
      "https://labutmadyprdhfqywwdn.supabase.co/auth/v1/.well-known/jwks.json",
    ),
  STUDIO_SUPABASE_URL: z.string().url(),
  STUDIO_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PORT: z.number().int().positive(),
});

export type ApiConfig = z.infer<typeof envSchema>;

export const apiConfig: ApiConfig = envSchema.parse({
  ...process.env,
  PORT: Number.isFinite(port) ? port : 3001,
});
