import type { PlanTask } from "./getTaskBreakdown";

export function serializeTaskPlan(
  originalPrompt: string,
  tasks: PlanTask[],
): string {
  const lines = tasks.map(
    (t, i) => `${i + 1}. ${t.label} — ${t.description}`,
  );
  return `${originalPrompt}\n\n## Build Plan (follow this order):\n${lines.join("\n")}`;
}
