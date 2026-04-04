export interface PlanTask {
  id: string;
  label: string;
  description: string;
}

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
        max_tokens: 800,
        system: `You are an AI app builder planning what to build for a user. The user described an app they want. Your job is to break their idea into 4-6 specific, concrete pages or features that YOU will build for them.

Rules:
- Every task must be SPECIFIC to the user's app idea — never generic (no "Project scaffold", "Core feature", "Data layer", "Polish")
- Each task = one visible page, screen, or major UI feature the user will see
- Labels should name the actual thing being built (e.g. "Revenue dashboard", "Customer table", "Pricing page")
- Descriptions should explain what the user will see and interact with, in plain language
- Write as if you're explaining your plan to a non-technical founder
- Order tasks by what makes sense to build first

Return ONLY a valid JSON array of objects with "label" and "description" fields.

Example for "a fitness tracking app":
[{"label":"Workout logger","description":"A form where you log exercises, sets, reps, and weight — with quick-add for your favorite moves"},{"label":"Progress dashboard","description":"Charts showing your strength gains, workout frequency, and personal records over time"},{"label":"Exercise library","description":"Searchable catalog of exercises with muscle group filters and how-to descriptions"},{"label":"Weekly planner","description":"Drag-and-drop calendar to schedule your workouts for the week ahead"},{"label":"Profile & goals","description":"Set your fitness goals, track body measurements, and see streaks"}]`,
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
    // Fallback: generate prompt-specific placeholders
    const fallback = generateFallback(prompt);
    return fallback.map((t, i) => ({ ...t, id: `task-${i}-${Date.now()}` }));
  }
}

function generateFallback(prompt: string): Omit<PlanTask, "id">[] {
  const lower = prompt.toLowerCase();
  if (/dashboard|saas|analytics/.test(lower)) {
    return [
      { label: "Overview dashboard", description: "Key metrics cards with revenue, users, and growth trends at a glance" },
      { label: "Data tables", description: "Searchable, sortable tables for your core data with filters and pagination" },
      { label: "Charts & analytics", description: "Interactive charts showing trends, comparisons, and breakdowns over time" },
      { label: "Settings & profile", description: "Account settings, team management, and notification preferences" },
    ];
  }
  if (/shop|store|ecommerce|product/.test(lower)) {
    return [
      { label: "Product catalog", description: "Grid of products with images, prices, and quick-add to cart" },
      { label: "Product detail page", description: "Full product view with photos, description, reviews, and size/variant picker" },
      { label: "Shopping cart", description: "Cart sidebar with quantity controls, subtotal, and checkout button" },
      { label: "Checkout flow", description: "Step-by-step checkout with shipping, payment, and order confirmation" },
    ];
  }
  if (/task|todo|project|kanban/.test(lower)) {
    return [
      { label: "Task board", description: "Kanban-style columns for To Do, In Progress, and Done with drag-and-drop cards" },
      { label: "Task detail", description: "Expanded view with description, assignee, due date, labels, and comments" },
      { label: "Team view", description: "See what everyone is working on with workload indicators and filters" },
      { label: "Calendar", description: "Month/week view of upcoming deadlines and scheduled tasks" },
    ];
  }
  // Generic but still specific-sounding
  return [
    { label: "Home page", description: "Landing view with the main content and navigation to all sections" },
    { label: "Main feature", description: "The primary screen where users do the core activity of your app" },
    { label: "Detail view", description: "Expanded view for individual items with full information and actions" },
    { label: "Account & settings", description: "User profile, preferences, and app configuration" },
  ];
}
