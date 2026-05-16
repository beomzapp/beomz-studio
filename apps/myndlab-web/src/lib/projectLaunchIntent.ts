import type { PlanStep } from "@beomz-studio/contracts";

export interface ProjectLaunchIntent {
  prompt: string;
  approvedPlan?: {
    summary?: string;
    steps: readonly PlanStep[];
  };
}

const STORAGE_KEY = "beomz.project-launch-intent";

function isPlanStep(value: unknown): value is PlanStep {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.title === "string" && typeof candidate.description === "string";
}

export function saveProjectLaunchIntent(intent: ProjectLaunchIntent): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
}

export function consumeProjectLaunchIntent(): ProjectLaunchIntent | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw) as {
      prompt?: unknown;
      approvedPlan?: {
        summary?: unknown;
        steps?: unknown;
      };
    };

    if (typeof parsed.prompt !== "string" || parsed.prompt.trim().length === 0) {
      return null;
    }

    const steps = Array.isArray(parsed.approvedPlan?.steps)
      ? parsed.approvedPlan.steps.filter(isPlanStep)
      : [];

    return {
      prompt: parsed.prompt,
      approvedPlan:
        steps.length > 0
          ? {
            summary:
              typeof parsed.approvedPlan?.summary === "string"
                ? parsed.approvedPlan.summary
                : undefined,
            steps,
          }
          : undefined,
    };
  } catch {
    return null;
  }
}
