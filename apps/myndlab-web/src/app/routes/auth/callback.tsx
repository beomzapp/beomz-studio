import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../../../lib/supabase";
import { Loader2, Eye, EyeOff } from "lucide-react";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

type Screen = "loading" | "reset-password" | "success";

export function AuthCallback() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Password recovery: Supabase redirects here with #type=recovery in the hash
    if (window.location.hash.includes("type=recovery")) {
      setScreen("reset-password");
      return;
    }

    // All other flows (Google OAuth, email verify) — navigate based on session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const referralCode = localStorage.getItem("referral_code");
        if (referralCode) {
          localStorage.removeItem("referral_code");
          void fetch("/api/referrals/attribution", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ referral_code: referralCode }),
          });
        }

        const pendingPrompt = sessionStorage.getItem("pending_build_prompt");
        if (pendingPrompt) {
          sessionStorage.removeItem("pending_build_prompt");
          navigate({ to: "/plan", search: { q: pendingPrompt } });
          return;
        }

        const savedRedirect = localStorage.getItem("beomz_auth_redirect");
        localStorage.removeItem("beomz_auth_redirect");

        if (savedRedirect && savedRedirect !== "/auth/login" && savedRedirect !== "/auth/callback") {
          navigate({ to: savedRedirect as "/" });
        } else {
          navigate({ to: "/studio/home" });
        }
      } else {
        navigate({ to: "/auth/login" });
      }
    });
  }, [navigate]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setUpdating(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setUpdating(false);
      return;
    }
    setScreen("success");
    setTimeout(() => {
      void navigate({ to: "/studio/home" });
    }, 1500);
  };

  if (screen === "reset-password") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f6] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#e5e5e5] bg-white p-10 shadow-sm">
          <BeomzLogo className="mx-auto mb-8 block h-7 w-auto text-[#1a1a1a]" />
          <h2 className="mb-1 text-center text-lg font-semibold text-[#1a1a1a]">Set new password</h2>
          <p className="mb-6 text-center text-sm text-[#9ca3af]">
            Choose a strong password for your account.
          </p>

          <form onSubmit={(e) => void handleUpdatePassword(e)} className="space-y-3">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
                autoComplete="new-password"
                autoFocus
                className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 pr-10 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-[#F97316]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 pr-10 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-[#F97316]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={updating || !password || !confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
            >
              {updating && <Loader2 size={14} className="animate-spin" />}
              Update password
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (screen === "success") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10l4 4 8-8" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#1a1a1a]">Password updated</p>
        </div>
      </div>
    );
  }

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
