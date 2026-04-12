import { z } from "zod";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PLATFORM_JWKS_URL: z
    .string()
    .url()
    .default(
      "https://srflynvdrsdazxvcxmzb.supabase.co/auth/v1/.well-known/jwks.json",
    ),
  STUDIO_SUPABASE_URL: z.string().url(),
  STUDIO_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PORT: z.number().int().positive(),
  // Stripe — all optional so the API boots without payments configured
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Subscription price IDs
  STRIPE_STARTER_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_STARTER_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_YEARLY_PRICE_ID: z.string().optional(),
  // Credit pack price IDs (V1: credits_200/500/1200)
  STRIPE_CREDITS_200_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_500_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_1200_PRICE_ID: z.string().optional(),
  // Redirect URLs for Stripe Checkout
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
});

export type ApiConfig = z.infer<typeof envSchema>;

export const apiConfig: ApiConfig = envSchema.parse({
  ...process.env,
  PORT: Number.isFinite(port) ? port : 3001,
});
