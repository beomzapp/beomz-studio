import { useState, useEffect } from "react";
import { supabase } from "./supabase.ts";

/**
 * Returns a reactive Supabase access token that updates via onAuthStateChange.
 * Starts as null until the session is hydrated from storage; once the token
 * is available, pages that depend on it will re-render and trigger their fetches.
 */
export function useAuthToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Hydrate from existing session immediately
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });

    // Stay in sync with future auth events (sign-in, token refresh, sign-out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return token;
}
