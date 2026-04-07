import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../../../lib/supabase";

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // If user had a pending build prompt before Google OAuth, send them straight to /plan
        const pendingPrompt = sessionStorage.getItem("pending_build_prompt");
        if (pendingPrompt) {
          sessionStorage.removeItem("pending_build_prompt");
          navigate({ to: "/plan", search: { q: pendingPrompt } });
        } else {
          navigate({ to: "/studio/home" });
        }
      } else {
        navigate({ to: "/auth/login" });
      }
    });
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <svg
          className="animate-spin text-orange"
          width="24"
          height="24"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle
            cx="8"
            cy="8"
            r="6.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="30 12"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm text-white/50">Signing you in...</p>
      </div>
    </div>
  );
}
