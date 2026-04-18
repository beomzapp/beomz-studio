/**
 * BEO-391 — Static copy for checklist labels, preamble fallback, and next-step chips.
 * Personalized preamble and most next-steps come from SSE; these are resilient fallbacks.
 */

export const CHECKLIST_LABELS = {
  planning: "Planning the structure",
  writing: "Writing components",
  polishing: "Polishing the code",
  deploying: "Starting your preview",
} as const;

export const PREAMBLE_FALLBACK = {
  restatement: "Got it — building this now.",
  bullets: [
    "Setting up the structure",
    "Picking sensible defaults",
    "Writing the components",
  ],
} as const;

export const NEXT_STEPS_FALLBACK = [
  { label: "Add a feature", prompt: "Add a small feature that fits this app" },
  { label: "Change the design", prompt: "Refresh the layout and visual design" },
  { label: "Add a database", prompt: "Wire up a simple database for persistence" },
] as const;
