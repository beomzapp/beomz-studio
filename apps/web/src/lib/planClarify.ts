/**
 * Plan clarification API — BEO-68.
 *
 * Calls Claude to decide whether a prompt needs clarifying questions,
 * and generates a build plan from answered questions.
 */

export interface ClarifyOption {
  label: string;
  description: string;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  type: "single" | "multi";
  options: ClarifyOption[];
}

export interface PlanBullet {
  label: string;
  description: string;
}

const FALLBACK_QUESTIONS: ClarifyQuestion[] = [
  {
    id: "fallback-1",
    question: "What type of app is this?",
    type: "single",
    options: [
      { label: "Dashboard / Analytics", description: "Charts, metrics, data tables, admin panels" },
      { label: "Marketplace / E-commerce", description: "Products, listings, cart, checkout" },
      { label: "Productivity / Tasks", description: "To-dos, kanban boards, project management" },
      { label: "Social / Community", description: "Profiles, feeds, messaging, groups" },
    ],
  },
  {
    id: "fallback-2",
    question: "Who will use this?",
    type: "single",
    options: [
      { label: "Just me", description: "Personal use, single-user dashboard" },
      { label: "My team", description: "Small team with shared access and roles" },
      { label: "My customers", description: "Public-facing app with user accounts" },
    ],
  },
  {
    id: "fallback-3",
    question: "What matters most for the first version?",
    type: "multi",
    options: [
      { label: "Clean design", description: "Polished UI, good typography, modern look" },
      { label: "Core functionality", description: "Get the main feature working first" },
      { label: "Mobile-friendly", description: "Responsive layout that works on phones" },
      { label: "Authentication", description: "Sign up, login, protected pages" },
    ],
  },
];

/**
 * Ask AI whether the prompt needs clarification.
 * Returns 0 questions for clear prompts, 2-4 for ambiguous ones.
 * Times out after 15s and falls back to default questions.
 */
export async function getClarifyQuestions(
  prompt: string,
): Promise<ClarifyQuestion[]> {
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
        max_tokens: 800,
        system: `You are an AI app builder. A user wants to build a web app. Based on their prompt, decide if you need clarifying questions before building.

Rules:
- If the prompt is clear and specific (e.g. "a SaaS dashboard for tracking sales with charts and team management"), return an empty array — no questions needed.
- If the prompt is vague or ambiguous (e.g. "an app", "something for my business", "a tracker"), return 2-4 clarifying questions.
- Each question should have 3-5 options with a bold label and a description subtitle.
- Questions should help you understand: what type of app, who uses it, what core features matter, and what style/aesthetic they want.
- Mark questions as "single" (pick one) or "multi" (pick several).
- Keep options concrete and app-specific, not generic.

Return ONLY a valid JSON array. Empty array = no questions needed.

Example for "a tracker":
[{"id":"q1","question":"What are you tracking?","type":"single","options":[{"label":"Financial assets","description":"Stocks, crypto, investments, portfolio tracking"},{"label":"Fitness & health","description":"Workouts, calories, body measurements, habits"},{"label":"Tasks & projects","description":"To-dos, deadlines, team assignments, kanban boards"},{"label":"Inventory","description":"Products, stock levels, orders, warehouse management"}]},{"id":"q2","question":"Who will use this?","type":"single","options":[{"label":"Just me","description":"Personal use, single-user dashboard"},{"label":"My team","description":"Small team with shared access and roles"},{"label":"My customers","description":"Public-facing app with user accounts"}]}]`,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    const text = data.content[0].text.trim();
    return JSON.parse(text) as ClarifyQuestion[];
  } catch {
    // Timeout or API error — show fallback questions so user isn't stuck
    return FALLBACK_QUESTIONS;
  }
}

/**
 * Generate a build plan from the prompt + answered questions.
 */
export async function generatePlan(
  prompt: string,
  answers: Record<string, string[]>,
): Promise<PlanBullet[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  // Format answers into context
  const answerContext = Object.entries(answers)
    .map(([q, a]) => `Q: ${q}\nA: ${a.join(", ")}`)
    .join("\n\n");

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
        max_tokens: 600,
        system: `You are an AI app builder. Given a user's app idea and their clarifying answers, create a build plan of 4-6 specific pages/features to build.

Each item must be specific to this app — no generic items like "Project scaffold" or "Settings".
Return ONLY a JSON array of objects with "label" and "description" fields.`,
        messages: [
          {
            role: "user",
            content: `Build: ${prompt}\n\nClarifying answers:\n${answerContext || "None — build with defaults."}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    return JSON.parse(data.content[0].text.trim()) as PlanBullet[];
  } catch {
    return [
      { label: "Home page", description: "Landing view with main content" },
      { label: "Core feature", description: "Primary functionality" },
      { label: "Detail view", description: "Expanded item view" },
      { label: "Settings", description: "User preferences" },
    ];
  }
}
