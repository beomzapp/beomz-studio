/**
 * BEO-704: Build needs detection — used to decide whether to show the DB/Auth
 * setup card before a build starts.
 *
 * Design principle: most real apps need persistent data. Instead of trying to
 * enumerate every possible data-heavy keyword, we default to needsDb=true and
 * only suppress the card for prompts that are clearly static or utility apps.
 * Auth is still opt-in — only shown when explicit login/account signals appear.
 */

/**
 * Prompts that clearly describe a static page or a stateless utility tool.
 * If any of these match, skip the setup card entirely.
 */
export const SKIP_SIGNALS = [
  // Static / presentational pages
  "landing page", "portfolio", "coming soon", "under construction",
  // Stateless calculators and converters
  "calculator", "converter", "currency converter", "unit converter",
  // Clocks and timers (no server-side state)
  "timer", "countdown", "clock", "stopwatch", "alarm clock",
  // Visual / canvas demos
  "animation", "particle", "canvas demo", "visualizer",
  // Colour / design tools
  "colour picker", "color picker", "palette generator",
  // Simple mini-games with no leaderboard
  "simple game", "clicker game",
  // Explicit one-shot tools
  "text tool", "static", "just a page", "html only",
];

/**
 * Signals that mean the app needs user login / accounts.
 * Auth is opt-in — only pre-selected when these appear in the prompt.
 */
export const AUTH_SIGNALS = [
  "login", "sign in", "sign up", "register", "account",
  "user", "users", "profile", "password", "authentication",
  "role", "permission", "access", "protected", "private",
  "personal", "multi-user", "team", "portal", "member area",
];

export interface BuildNeeds {
  needsDb: boolean;
  needsAuth: boolean;
  skip: boolean;
}

/**
 * Returns whether a prompt implies the app needs a database and/or auth.
 *
 * Most real apps benefit from persistent data, so needsDb defaults to true.
 * The card is skipped only when the prompt is clearly a static/utility build
 * (matched by SKIP_SIGNALS). Auth is shown only when explicit account/login
 * signals are present.
 */
export function detectBuildNeeds(prompt: string): BuildNeeds {
  const lower = prompt.toLowerCase();

  // Static / utility prompts — no setup needed
  if (SKIP_SIGNALS.some(signal => lower.includes(signal))) {
    return { needsDb: false, needsAuth: false, skip: true };
  }

  // Auth is selective — only pre-select "Yes" when the prompt explicitly implies accounts
  const needsAuth = AUTH_SIGNALS.some(signal => lower.includes(signal));

  // Any real app prompt that isn't obviously static needs persistent data
  return { needsDb: true, needsAuth, skip: false };
}
