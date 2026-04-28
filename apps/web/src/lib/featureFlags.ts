import { getApiBaseUrl } from "./api";

export type ModuleFlagState = "live" | "coming_soon" | "disabled";

export type ModuleKey =
  | "web_apps"
  | "websites"
  | "mobile_apps"
  | "images"
  | "videos"
  | "agents";

export type ModulesFlags = Record<ModuleKey, ModuleFlagState>;

export interface FeatureFlagsResponse {
  modules: ModulesFlags;
}

// Default flags mirror the historical hardcoded behaviour so the studio
// stays usable when the public endpoint is unavailable (network failure,
// stale deploy, etc.). See BEO-694.
export const DEFAULT_MODULES_FLAGS: ModulesFlags = {
  web_apps: "live",
  websites: "live",
  mobile_apps: "coming_soon",
  images: "coming_soon",
  videos: "coming_soon",
  agents: "live",
};

const VALID_STATES: ReadonlySet<ModuleFlagState> = new Set([
  "live",
  "coming_soon",
  "disabled",
]);

function normaliseState(value: unknown): ModuleFlagState | null {
  return typeof value === "string" && VALID_STATES.has(value as ModuleFlagState)
    ? (value as ModuleFlagState)
    : null;
}

function normaliseFlags(raw: unknown): ModulesFlags {
  const merged: ModulesFlags = { ...DEFAULT_MODULES_FLAGS };
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(DEFAULT_MODULES_FLAGS) as ModuleKey[]) {
      const next = normaliseState((raw as Record<string, unknown>)[key]);
      if (next) merged[key] = next;
    }
  }
  return merged;
}

// Cache the resolved flags for the lifetime of the SPA session so the
// fetch only runs once across mounts/navigations.
let cached: ModulesFlags | null = null;
let inFlight: Promise<ModulesFlags> | null = null;

export function getCachedModuleFlags(): ModulesFlags | null {
  return cached;
}

export async function loadModuleFlags(): Promise<ModulesFlags> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/feature-flags`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Partial<FeatureFlagsResponse> | null;
      const modules = normaliseFlags(data?.modules);
      cached = modules;
      return modules;
    } catch {
      // Fallback to hardcoded defaults on any failure so the studio nav
      // never breaks for end users.
      cached = { ...DEFAULT_MODULES_FLAGS };
      return cached;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
