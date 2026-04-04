import type { StudioDbClient } from "@beomz-studio/studio-db";

import type { AnthropicUsage } from "./GenerationEngine.js";

export interface TurnCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
}

export interface CreditBalanceSnapshot {
  orgId: string;
  balanceUsd: number;
}

export interface CreditDeductionResult extends CreditBalanceSnapshot {
  deductedUsd: number;
}

export interface CreditGuard {
  check(orgId: string, thresholdUsd?: number): Promise<CreditBalanceSnapshot>;
  deduct(orgId: string, cost: TurnCost | number): Promise<CreditDeductionResult>;
}

export const SONNET_4_PRICING_PER_MILLION_TOKENS = {
  cacheReadUsd: 0.30,
  cacheWriteUsd: 3.75,
  inputUsd: 3,
  outputUsd: 15,
} as const;

export const DEFAULT_CREDIT_THRESHOLD_USD = 0.01;

export class InsufficientCreditsError extends Error {
  readonly balanceUsd: number;
  readonly orgId: string;
  readonly thresholdUsd: number;

  constructor(input: {
    orgId: string;
    balanceUsd: number;
    thresholdUsd: number;
  }) {
    super(
      `Insufficient credits for org ${input.orgId}: balance ${input.balanceUsd.toFixed(6)} is below ${input.thresholdUsd.toFixed(6)}.`,
    );
    this.name = "InsufficientCreditsError";
    this.balanceUsd = input.balanceUsd;
    this.orgId = input.orgId;
    this.thresholdUsd = input.thresholdUsd;
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toChargeAmount(cost: TurnCost | number): number {
  return typeof cost === "number" ? roundUsd(cost) : roundUsd(cost.estimatedCostUsd);
}

export function calculateTurnCost(usage?: AnthropicUsage): TurnCost {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage?.cache_creation_input_tokens ?? 0;

  return {
    cacheReadTokens,
    cacheWriteTokens,
    estimatedCostUsd: roundUsd(
      (
        (inputTokens * SONNET_4_PRICING_PER_MILLION_TOKENS.inputUsd)
        + (outputTokens * SONNET_4_PRICING_PER_MILLION_TOKENS.outputUsd)
        + (cacheReadTokens * SONNET_4_PRICING_PER_MILLION_TOKENS.cacheReadUsd)
        + (cacheWriteTokens * SONNET_4_PRICING_PER_MILLION_TOKENS.cacheWriteUsd)
      ) / 1_000_000,
    ),
    inputTokens,
    outputTokens,
  };
}

export function createSupabaseCreditGuard(input: {
  db?: StudioDbClient;
} = {}): CreditGuard {
  let cachedDb = input.db;

  async function resolveDb(): Promise<StudioDbClient> {
    if (cachedDb) {
      return cachedDb;
    }

    const { createStudioDbClient } = await import("@beomz-studio/studio-db");
    cachedDb = createStudioDbClient();
    return cachedDb;
  }

  async function readBalance(orgId: string): Promise<CreditBalanceSnapshot> {
    const db = await resolveDb();
    const org = await db.findOrgById(orgId);

    if (!org) {
      throw new Error(`Org ${orgId} does not exist in the studio database.`);
    }

    return {
      balanceUsd: org.credits_balance,
      orgId,
    };
  }

  return {
    async check(orgId, thresholdUsd = DEFAULT_CREDIT_THRESHOLD_USD) {
      const balance = await readBalance(orgId);

      if (balance.balanceUsd < thresholdUsd) {
        throw new InsufficientCreditsError({
          balanceUsd: balance.balanceUsd,
          orgId,
          thresholdUsd,
        });
      }

      return balance;
    },
    async deduct(orgId, cost) {
      const requestedUsd = toChargeAmount(cost);

      if (requestedUsd === 0) {
        const balance = await readBalance(orgId);
        return {
          ...balance,
          deductedUsd: 0,
        };
      }

      const db = await resolveDb();

      try {
        const org = await db.deductOrgCreditsBalance(orgId, requestedUsd);
        return {
          balanceUsd: org.credits_balance,
          deductedUsd: requestedUsd,
          orgId,
        };
      } catch (error) {
        const balance = await readBalance(orgId);
        const message = error instanceof Error ? error.message : "Unknown credit deduction error.";

        if (message.includes("INSUFFICIENT_CREDITS")) {
          throw new InsufficientCreditsError({
            balanceUsd: balance.balanceUsd,
            orgId,
            thresholdUsd: requestedUsd,
          });
        }

        throw error;
      }
    },
  };
}
