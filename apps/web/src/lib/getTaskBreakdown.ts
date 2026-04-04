export interface PlanTask {
  id: string;
  label: string;
  description: string;
}

const FALLBACK_TASKS: PlanTask[] = [
  { id: "task-0", label: "Project scaffold", description: "Set up base layout, routing, and navigation structure" },
  { id: "task-1", label: "Core feature", description: "Build the main functionality and primary user flow" },
  { id: "task-2", label: "Data layer", description: "Connect data sources, state management, and API integrations" },
  { id: "task-3", label: "Authentication", description: "Add sign-up, login, and protected route handling" },
  { id: "task-4", label: "Polish & settings", description: "Responsive design, settings page, and final styling" },
];

export async function getTaskBreakdown(prompt: string): Promise<PlanTask[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: `You are a software architect planning an AI-generated web app build. Given an app idea, break it into 5-8 ordered build tasks. Each task should be a discrete, implementable step. Return ONLY a valid JSON array of objects with "label" (short task name) and "description" (one sentence explaining what gets built). Example: [{"label":"Project scaffold","description":"Set up base layout with navigation and routing"},{"label":"Dashboard","description":"Build the main dashboard with key metrics cards"}]`,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const parsed = JSON.parse(data.content[0].text.trim()) as Array<{
      label: string;
      description: string;
    }>;
    const now = Date.now();
    return parsed.map((t, i) => ({
      id: `task-${i}-${now}`,
      label: t.label,
      description: t.description ?? "",
    }));
  } catch {
    return FALLBACK_TASKS.map((t, i) => ({ ...t, id: `task-${i}-${Date.now()}` }));
  }
}
