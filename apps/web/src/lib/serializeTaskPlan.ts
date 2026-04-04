import type { PlanStep } from "@beomz-studio/contracts";

export function serializeTaskPlan(
  originalPrompt: string,
  tasks: readonly PlanStep[],
): string {
  const lines = tasks.map(
    (t, i) => `${i + 1}. ${t.title} — ${t.description}`,
  );
  return `${originalPrompt}\n\n## Build Plan (follow this order):\n${lines.join("\n")}`;
}
