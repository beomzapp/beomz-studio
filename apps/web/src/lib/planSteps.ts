import type { PlanStep } from "@beomz-studio/contracts";

export interface EditablePlanStep extends PlanStep {
  id: string;
}

function createStepId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `plan-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toEditablePlanSteps(
  steps: readonly PlanStep[],
): EditablePlanStep[] {
  return steps.map((step) => ({
    ...step,
    id: createStepId(),
  }));
}

export function toPlanSteps(
  steps: readonly EditablePlanStep[],
): PlanStep[] {
  return steps.map(({ description, title }) => ({ description, title }));
}

export function createEmptyEditablePlanStep(): EditablePlanStep {
  return {
    id: createStepId(),
    title: "",
    description: "",
  };
}
