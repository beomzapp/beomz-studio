import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

/** Keys used to persist email/password auth tokens that are not Supabase-issued. */
export const BEOMZ_TOKEN_KEY = "beomz_access_token";
export const BEOMZ_REFRESH_KEY = "beomz_refresh_token";

/**
 * Build a minimal synthetic Session from a stored custom JWT so that all
 * callers that do `if (session)` or `session?.user?.user_metadata?.X` still
 * behave correctly without a Supabase-issued token.
 */
function makeSyntheticSession(accessToken: string, refreshToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    },
  } as unknown as Session;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        // Clear email auth tokens so the studio route guard doesn't let
        // a signed-out user back in via the localStorage fallback.
        localStorage.removeItem(BEOMZ_TOKEN_KEY);
        localStorage.removeItem(BEOMZ_REFRESH_KEY);
        window.location.href = "/";
        return;
      }
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // If no Supabase session exists, fall back to a custom email auth token
  // stored in localStorage. This handles the case where the API returned
  // a non-Supabase JWT that supabase.auth.setSession() rejected.
  const effectiveSession: Session | null = session ?? (() => {
    const tok = localStorage.getItem(BEOMZ_TOKEN_KEY);
    if (!tok) return null;
    return makeSyntheticSession(tok, localStorage.getItem(BEOMZ_REFRESH_KEY) ?? "");
  })();

  return { session: effectiveSession, loading };
}
