/**
 * BEO-261: Credit system constants and helpers.
 *
 * Mirrors V1 apps/builder/src/lib/plans.ts and ai/route.ts deduction logic.
 * All costs are NUMERIC(10,1) compatible — one decimal place.
 */

// ─── Plan definitions ─────────────────────────────────────────────────────────
// V1 strategy: monthly allowance resets via webhook (paid) or lazy daily reset (free).
// topup_credits (purchased packs) are consumed FIRST and never expire.

export interface PlanLimit {
  credits: number;          // monthly credit allowance
  dailyReset?: number;      // free tier: daily reset amount (replaces monthlies)
  maxTopup: boolean;        // whether paid topup packs are available
}

export const PLAN_LIMITS: Record<string, PlanLimit> = {
  free: {
    credits: 30,            // 30 credits/month, reset daily (lazy reset)
    dailyReset: 10,         // 10 credits each day on demand (V1: 5 free/day, we use 10)
    maxTopup: false,
  },
  starter: {
    credits: 100,           // 100 credits/month
    maxTopup: true,
  },
  pro: {
    credits: 300,           // 300 credits/month
    maxTopup: true,
  },
  business: {
    credits: 1000,          // 1000 credits/month
    maxTopup: true,
  },
};

// ─── Credit packs (one-time purchases) ───────────────────────────────────────
// V1 pricing: $9/$19/$49 for 50/100/300 credits

export interface CreditPack {
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_50",  credits: 50,  priceUsd: 9,  label: "50 Credits"  },
  { id: "pack_100", credits: 100, priceUsd: 19, label: "100 Credits" },
  { id: "pack_300", credits: 300, priceUsd: 49, label: "300 Credits" },
];

// ─── Cost formula ─────────────────────────────────────────────────────────────
// V1: max(0.1, round((3.0 + totalOutputTokens / 600) * 10) / 10)
// Minimum 0.1 credits; typical build with 12 000 output tokens ≈ 23 credits.
// Complexity scales linearly with AI output — larger/more complex apps cost more.

export function calcCreditCost(outputTokens: number): number {
  if (outputTokens <= 0) return 0;
  const raw = 3.0 + outputTokens / 600;
  return Math.max(0.1, Math.round(raw * 10) / 10);
}

// ─── USD cost helper ──────────────────────────────────────────────────────────
// V1: $0.045 per credit (≈ $0.90 for a typical 20-credit build)

const USD_PER_CREDIT = 0.045;

export function calcCostUsd(credits: number): number {
  return Math.round(credits * USD_PER_CREDIT * 10000) / 10000;
}

// ─── Free tier lazy daily reset ───────────────────────────────────────────────
// V1: check if 24h have passed since daily_reset_at; if so, reset credits to
// free daily amount and update daily_reset_at. No cron needed.
// We reset to min(PLAN_LIMITS.free.dailyReset, PLAN_LIMITS.free.credits).

export const FREE_DAILY_RESET_HOURS = 24;

export function needsFreeDailyReset(dailyResetAt: string | null): boolean {
  if (!dailyResetAt) return true;
  const lastReset = Date.parse(dailyResetAt);
  const hoursSince = (Date.now() - lastReset) / 3_600_000;
  return hoursSince >= FREE_DAILY_RESET_HOURS;
}

// ─── Admin bypass ─────────────────────────────────────────────────────────────
// Beomz team members bypass credit checks entirely. Mirror V1 admin list.

const ADMIN_EMAILS = new Set([
  "omar@beomz.ai",
  "admin@beomz.ai",
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}
