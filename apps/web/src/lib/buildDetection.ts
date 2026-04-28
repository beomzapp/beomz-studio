/**
 * BEO-704: Build needs detection — keyword-based signal matching.
 * Used to determine whether to show the DB/Auth setup card before a first build.
 */

export const DB_SIGNALS = [
  "save", "store", "track", "manage", "record", "log", "history",
  "dashboard", "report", "list", "create", "edit", "delete", "update",
  "submit", "upload", "inventory", "catalog", "crm", "erp", "admin",
  "staff", "employee", "customer", "client", "product", "order", "booking",
  "appointment", "invoice", "expense", "budget", "project", "task", "ticket",
  "issue", "asset", "property", "schedule", "roster", "member", "subscriber",
];

export const AUTH_SIGNALS = [
  "login", "sign in", "sign up", "register", "account", "user",
  "users", "profile", "password", "authentication", "admin", "role",
  "permission", "access", "protected", "private", "personal", "multi-user",
  "team", "staff", "portal", "member area",
];

export const SKIP_SIGNALS = [
  "landing page", "portfolio", "calculator", "converter", "timer",
  "clock", "countdown", "simple game", "colour picker", "text tool",
  "static", "just a page",
];

export interface BuildNeeds {
  needsDb: boolean;
  needsAuth: boolean;
  skip: boolean;
}

export function detectBuildNeeds(prompt: string): BuildNeeds {
  const lower = prompt.toLowerCase();

  // Skip signals take precedence — these are presentational/utility apps
  if (SKIP_SIGNALS.some(signal => lower.includes(signal))) {
    return { needsDb: false, needsAuth: false, skip: true };
  }

  const needsDb = DB_SIGNALS.some(signal => lower.includes(signal));
  const needsAuth = AUTH_SIGNALS.some(signal => lower.includes(signal));

  return { needsDb, needsAuth, skip: false };
}
