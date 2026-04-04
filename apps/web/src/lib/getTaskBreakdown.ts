import type { PlanStep } from "@beomz-studio/contracts";

/**
 * Deprecated shim retained to avoid breaking older imports while
 * conversational plan mode migrates the callers to the API-backed flow.
 */
export type PlanTask = PlanStep & {
  id: string;
  label: string;
};

export async function getTaskBreakdown(): Promise<PlanTask[]> {
  return [];
}
