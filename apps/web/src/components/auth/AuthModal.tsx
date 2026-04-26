/**
 * AuthModal — full-screen overlay with sign in / sign up.
 * Triggered from LandingPage when an unsigned user hits Enter or "Get started".
 * Does NOT navigate away — it overlays the landing page.
 * For Google OAuth, saves the pending prompt to sessionStorage so callback.tsx
 * can navigate to /plan after auth completes.
 */
import { useState } from "react";
import { X, Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getApiBaseUrl } from "../../lib/api";
import BeomzLogo from "../../assets/beomz-logo.svg?react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * The prompt the user typed. Saved to sessionStorage before Google OAuth
   * so it can be restored by /auth/callback → /plan.
   */
  pendingPrompt?: string;
  /** Start in signin or signup mode. Defaults to "signin". */
  initialMode?: "signin" | "signup";
}

type Screen = "main" | "check-email";

export function AuthModal({ open, onClose, pendingPrompt, initialMode = "signin" }: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [screen, setScreen] = useState<Screen>("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    // Save prompt so callback.tsx can redirect to /plan after OAuth
    if (pendingPrompt) {
      sessionStorage.setItem("pending_build_prompt", pendingPrompt);
    }
    // Save the page the user was on so callback.tsx can return them there.
    const currentPath = window.location.pathname;
    if (currentPath !== "/auth/login" && currentPath !== "/auth/callback") {
      localStorage.setItem("beomz_auth_redirect", currentPath);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/email/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Sign up failed. Please try again.");
        setLoading(false);
        return;
      }
      setScreen("check-email");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/email/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign in failed. Please check your credentials.");
        setLoading(false);
        return;
      }
      if (data.access_token && data.refresh_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      }
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await fetch(`${getApiBaseUrl()}/api/auth/email/resend-verification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendSent(true);
    } catch {
      // silently ignore
    } finally {
      setResendLoading(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  // ── Check-email screen ──────────────────────────────────────────────────────
  if (screen === "check-email") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-md"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="relative w-full max-w-sm rounded-2xl bg-[#faf9f6] p-10 shadow-xl text-center">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#9ca3af] transition-colors hover:bg-black/5 hover:text-[#6b7280]"
          >
            <X size={16} />
          </button>

          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF7ED]">
            <Mail size={22} className="text-[#F97316]" />
          </div>

          <h2 className="mb-1 text-lg font-semibold text-[#1a1a1a]">Check your email</h2>
          <p className="mb-6 text-sm text-[#6b7280]">
            We sent a verification link to <span className="font-medium text-[#1a1a1a]">{email}</span>
          </p>

          {resendSent ? (
            <p className="mb-4 text-xs text-green-600">Verification email resent.</p>
          ) : (
            <button
              onClick={() => void handleResend()}
              disabled={resendLoading}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e2e2e2] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] transition-shadow hover:shadow-md disabled:opacity-50"
            >
              {resendLoading && <Loader2 size={14} className="animate-spin" />}
              Resend email
            </button>
          )}

          <button
            onClick={() => { setScreen("main"); setMode("signin"); setError(null); }}
            className="text-sm text-[#F97316] hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Main sign in / sign up screen ──────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-[#faf9f6] p-10 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#9ca3af] transition-colors hover:bg-black/5 hover:text-[#6b7280]"
        >
          <X size={16} />
        </button>

        {/* Beomz logo */}
        <BeomzLogo className="mx-auto mb-6 block h-7 w-auto text-[#1a1a1a]" />

        <h2 className="mb-1 text-center text-lg font-semibold text-[#1a1a1a]">
          {mode === "signin" ? "Sign in to Beomz" : "Create your account"}
        </h2>
        <p className="mb-6 text-center text-sm text-[#9ca3af]">
          {mode === "signin" ? "Welcome back." : "Start building for free."}
        </p>

        {/* Google OAuth — untouched */}
        <button
          onClick={() => void handleGoogle()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#e2e2e2] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] transition-shadow hover:shadow-md disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
            </svg>
          )}
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#e2e2e2]" />
          <span className="text-xs text-[#9ca3af]">or</span>
          <div className="h-px flex-1 bg-[#e2e2e2]" />
        </div>

        {/* Email / password forms */}
        {mode === "signup" ? (
          <form onSubmit={(e) => void handleEmailSignup(e)} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-[#F97316]"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 8 characters)"
                autoComplete="new-password"
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
                placeholder="Confirm password"
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
              disabled={loading || !email || !password || !confirmPassword}
              className="w-full rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
            >
              {loading ? "Please wait…" : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleEmailSignin(e)} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-[#F97316]"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
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

            <div className="flex justify-end">
              <a
                href="/forgot-password"
                className="text-xs text-[#9ca3af] hover:text-[#F97316]"
              >
                Forgot password?
              </a>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
            >
              {loading ? "Please wait…" : "Sign in"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-[#9ca3af]">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={switchMode} className="text-[#F97316] hover:underline">
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
