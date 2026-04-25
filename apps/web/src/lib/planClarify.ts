/**
 * Plan clarification API — BEO-68.
 *
 * Routes through the Railway API server — never calls Anthropic directly.
 * The server handles AI calls with its own API key.
 */

import { getApiBaseUrl, handleUnauthorizedResponse } from "./api";
import { supabase } from "./supabase";

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

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Ask AI whether the prompt needs clarification.
 * Calls Railway API: POST /plan/clarify { prompt }
 * Returns 0 questions for clear prompts, 2-4 for ambiguous ones.
 * Times out after 15s and falls back to default questions.
 */
export async function getClarifyQuestions(
  prompt: string,
): Promise<ClarifyQuestion[]> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${getApiBaseUrl()}/plan/clarify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      await handleUnauthorizedResponse(res);
      throw new Error(`${res.status}`);
    }
    const data = await res.json();
    return (data.questions ?? data) as ClarifyQuestion[];
  } catch {
    // Timeout, network error, or endpoint not deployed yet — show fallback
    return FALLBACK_QUESTIONS;
  }
}

/**
 * Generate a build plan from the prompt + answered questions.
 * Calls Railway API: POST /plan/generate { prompt, answers }
 */
export async function generatePlan(
  prompt: string,
  answers: Record<string, string[]>,
): Promise<PlanBullet[]> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${getApiBaseUrl()}/plan/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt, answers }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      await handleUnauthorizedResponse(res);
      throw new Error(`${res.status}`);
    }
    const data = await res.json();
    return (data.plan ?? data) as PlanBullet[];
  } catch {
    return [
      { label: "Home page", description: "Landing view with main content" },
      { label: "Core feature", description: "Primary functionality" },
      { label: "Detail view", description: "Expanded item view" },
      { label: "Settings", description: "User preferences" },
    ];
  }
}
