// INTERNAL — never expose these constants publicly
const MARKUP_MULTIPLIER = 3.0
const CREDITS_PER_USD = 100
const NEGATIVE_FLOOR = -80  // max negative balance (one build's worth)
const SUB_CREDITS_PER_DOLLAR = 2000 / 19  // ~105.26 — topups must always stay below
const BUILD_CREDIT_RATE_PER_MILLION = 49.5
const ITERATION_CREDIT_RATE_PER_MILLION = 20.7
const ITERATION_RATE_MULTIPLIER = ITERATION_CREDIT_RATE_PER_MILLION / BUILD_CREDIT_RATE_PER_MILLION

function roundCredits(credits: number): number {
  return Math.ceil(credits * 100) / 100
}

export function calcCreditCost(inputTokens: number, outputTokens: number): number {
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000
  return roundCredits(costUsd * MARKUP_MULTIPLIER * CREDITS_PER_USD)
  // returns 2dp decimal e.g. 14.73
}

export function calcIterationCreditCost(inputTokens: number, outputTokens: number): number {
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000
  return roundCredits(costUsd * MARKUP_MULTIPLIER * CREDITS_PER_USD * ITERATION_RATE_MULTIPLIER)
}

export function calcCreditCostHaiku(inputTokens: number, outputTokens: number): number {
  const costUsd = (inputTokens * 1 + outputTokens * 5) / 1_000_000
  return roundCredits(costUsd * MARKUP_MULTIPLIER * CREDITS_PER_USD)
}

export const NEGATIVE_FLOOR_CONST = NEGATIVE_FLOOR

export const PLAN_LIMITS = {
  free:         { credits: 0, rolloverCap: 0, signupGrant: 200, maxTopup: false, price: 0, label: "Free" },
  pro_starter:  { credits: 2000, rolloverCap: 2000, signupGrant: 0, maxTopup: true, price: 19, label: "Pro Starter" },
  pro_builder:  { credits: 4000, rolloverCap: 8000, signupGrant: 0, maxTopup: true, price: 39, label: "Pro Builder" },
  business:     { credits: 20000, rolloverCap: 60000, signupGrant: 0, maxTopup: true, price: 199, label: "Business" },
}

export const CREDIT_PACKS = [
  { id: "credits_400",  credits: 400,  priceUsd: 5,  label: "Starter Pack" },
  { id: "credits_1000", credits: 1000, priceUsd: 12, label: "Builder Pack" },
  { id: "credits_2500", credits: 2500, priceUsd: 29, label: "Power Pack" },
  { id: "credits_5000", credits: 5000, priceUsd: 59, label: "Mega Pack" },
]

export const CONVERSATIONAL_COST = 1
export const WEB_RESEARCH_SURCHARGE = 1
export const CHAT_MESSAGE_COST_HAIKU = 1
export const CHAT_MESSAGE_COST_SONNET = 3
export const CHAT_IMAGE_ANALYSIS_SURCHARGE = 1

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return new Set(["omar@beomz.ai", "admin@beomz.ai"]).has(email.toLowerCase())
}
