import { z } from "zod";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  MOCK_ANTHROPIC: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
      }

      return false;
    }),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  FAL_KEY: z.string().min(1).optional(),
  PLATFORM_JWKS_URL: z
    .string()
    .url()
    .default(
      "https://srflynvdrsdazxvcxmzb.supabase.co/auth/v1/.well-known/jwks.json",
    ),
  STUDIO_SUPABASE_URL: z.string().url(),
  STUDIO_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PROJECT_JWT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().optional(),
  PORT: z.number().int().positive(),
  // Stripe — all optional so the API boots without payments configured
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Subscription price IDs (new 4-plan structure: pro_starter, pro_builder, business)
  STRIPE_STARTER_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_STARTER_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_STARTER_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_STARTER_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_BUILDER_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_BUILDER_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_YEARLY_PRICE_ID: z.string().optional(),
  // Credit pack price IDs (rescaled: 50/150/400 credits — BEO-345)
  STRIPE_CREDITS_50_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_150_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_200_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_400_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_500_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_1000_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_1200_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_2500_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_5000_PRICE_ID: z.string().optional(),
  // Redirect URLs for Stripe Checkout
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
  // BEO-130: built-in DB (beomz-user-data project snmocsydvcvqerlommek)
  USER_DATA_SUPABASE_URL: z.string().url().optional(),
  USER_DATA_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  USER_DATA_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  // Supabase Management API personal access token — for schema provisioning
  SUPABASE_MANAGEMENT_API_KEY: z.string().min(1).optional(),
  SUPABASE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  SUPABASE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  // Vercel deploy — published apps at slug.beomz.app
  VERCEL_TOKEN: z.string().min(1).optional(),
  VERCEL_PROJECT_ID: z.string().min(1).optional(),
  VERCEL_TEAM_ID: z.string().min(1).optional(),
  // AES-256-GCM key for encrypting AI provider keys at rest
  ENCRYPTION_SECRET: z.string().min(1).optional(),
  // ─── Audit rollout flags (BEO-757, audit-2026-05) ──────────────────────────
  // String flags read as "true"/"false". Consumers compare via
  // `apiConfig.FLAG === "true"`. Defaults preserve current production behavior.
  USE_GENERATION_ENGINE: z.string().optional().default("false"),
  USE_CHAT_PANEL_V2: z.string().optional().default("false"),
  /** Comma-separated list of org UUIDs allowed to opt into the engine path even when USE_GENERATION_ENGINE is "false". Pilot rollout (BEO-776). */
  ENGINE_PILOT_ORG_IDS: z.string().optional().default(""),
  ENABLE_ITERATION_INTENT_CLASSIFIER: z.string().optional().default("false"),
  ITERATION_INTENT_PILOT_ORG_IDS: z.string().optional().default(""),
  ENABLE_ANTHROPIC_RETRY: z.string().optional().default("true"),
  STRICT_AI_ERROR_HANDLING: z.string().optional().default("false"),
  ENABLE_TODO_SCAFFOLD_FALLBACK: z.string().optional().default("true"),
  BATCH_STREAMING_DELTAS: z.string().optional().default("false"),
  IMPLEMENTBAR_QUIET_PERIOD_MS: z.string().optional().default("0"),
  USE_TRANSACTIONAL_MIGRATIONS: z.string().optional().default("false"),
  ITERATION_STRICT_SCOPE: z.string().optional().default("false"),
  ITERATION_STRICT_SCOPE_PILOT_ORG_IDS: z.string().optional().default(""),
  STALE_BUILD_WATCHDOG_MODE: z.enum(["off", "dry-run", "on"]).optional().default("off"),
});

export type ApiConfig = z.infer<typeof envSchema>;

export const apiConfig: ApiConfig = envSchema.parse({
  ...process.env,
  PORT: Number.isFinite(port) ? port : 3001,
});
