/**
 * BEO-322 / BEO-345: Credit system constants and helpers.
 *
 * BEO-345 rescale: all credit costs divided by ~8 vs V1 so that
 * 1 credit ≈ 1 small action (Lovable model). Actual Anthropic API
 * cost to Beomz is IDENTICAL — purely a unit-of-account change.
 *
 * All costs are NUMERIC(10,2) compatible — one decimal place output.
 */

// ─── Plan definitions ─────────────────────────────────────────────────────────
// Four plans: free, pro_starter, pro_builder, business.
// Deduction order: topup_credits → rollover_credits → monthly_credits.

export interface PlanLimit {
  credits: number;       // monthly_credits allocation (0 for free)
  rolloverCap: number;   // max rollover_credits carried into next period
  signupGrant: number;   // one-time grant on org creation (free plan only)
  maxTopup: boolean;     // whether paid topup packs are available
  price: number;         // USD/month
  label: string;
}

export const PLAN_LIMITS: Record<string, PlanLimit> = {
  free: {
    credits: 0,
    rolloverCap: 0,
    signupGrant: 10,     // 10 credits on signup — enough for ~3 simple builds
    maxTopup: false,
    price: 0,
    label: "Free",
  },
  pro_starter: {
    credits: 500,
    rolloverCap: 500,    // 1x monthly
    signupGrant: 0,
    maxTopup: true,
    price: 19,
    label: "Pro Starter",
  },
  pro_builder: {
    credits: 1200,
    rolloverCap: 2400,   // 2x monthly
    signupGrant: 0,
    maxTopup: true,
    price: 39,
    label: "Pro Builder",
  },
  business: {
    credits: 6000,
    rolloverCap: 18000,  // 3x monthly
    signupGrant: 0,
    maxTopup: true,
    price: 199,
    label: "Business",
  },
};

// ─── Credit packs (one-time purchases) ───────────────────────────────────────
// Rescaled to new human-scale credit amounts (BEO-345).

export interface CreditPack {
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "credits_50",  credits: 50,  priceUsd: 5,  label: "Small Pack (50 Credits)"   },
  { id: "credits_150", credits: 150, priceUsd: 12, label: "Medium Pack (150 Credits)" },
  { id: "credits_400", credits: 400, priceUsd: 29, label: "Large Pack (400 Credits)"  },
];

// ─── Credit thresholds (BEO-320) ──────────────────────────────────────────────
// Minimum balance required before a build is allowed to start.
// Keeps Anthropic spend recoverable when deduction caps at available balance.

export const CREDIT_THRESHOLD = 8; // complex_build minimum (BEO-345 rescale)
export const SIMPLE_BUILD_MIN = 3; // simple_build minimum

// ─── Cost formula ─────────────────────────────────────────────────────────────
// BEO-345: divide by 8 to bring to human scale.
// Old: max(0.1, round((3.0 + outputTokens / 600) * 10) / 10)
// New: max(0.01, round((3.0 + outputTokens / 600) * 10 / 8) / 10)
//
// Typical costs at new scale:
//   Tiny tweak (~1k tokens):     ~0.5 credits
//   Small edit (~3k tokens):     ~1.0 credits
//   Simple build (~8k tokens):   ~3.0 credits
//   Complex build phase (~20k):  ~6.0 credits
//   Full 5-phase (~100k tokens): ~30 credits

export function calcCreditCost(outputTokens: number): number {
  if (outputTokens <= 0) return 0;
  const raw = 3.0 + outputTokens / 600;
  return Math.max(0.01, Math.round((raw * 10) / 8) / 10);
}

// ─── USD cost helper ──────────────────────────────────────────────────────────
// Rate adjusted for new scale: $0.36 per credit (same effective $/API-call).

const USD_PER_CREDIT = 0.36;

export function calcCostUsd(credits: number): number {
  return Math.round(credits * USD_PER_CREDIT * 10000) / 10000;
}

// ─── Admin bypass ─────────────────────────────────────────────────────────────
// Beomz team members bypass credit checks entirely.

const ADMIN_EMAILS = new Set([
  "omar@beomz.ai",
  "admin@beomz.ai",
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}
