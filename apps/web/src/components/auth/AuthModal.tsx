/**
 * AuthModal — full-screen overlay with sign in / sign up.
 * Triggered from LandingPage when an unsigned user hits Enter or "Get started".
 * Does NOT navigate away — it overlays the landing page.
 * For Google OAuth, saves the pending prompt to sessionStorage so callback.tsx
 * can navigate to /plan after auth completes.
 */
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
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

export function AuthModal({ open, onClose, pendingPrompt, initialMode = "signin" }: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // For email sign-in: LandingPage useEffect watches session and restores prompt.
      // Close modal immediately for a clean UX.
      onClose();
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
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

        {/* Google OAuth */}
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

        {/* Email / password */}
        <form onSubmit={(e) => void handleEmailAuth(e)} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-[#F97316]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-[#F97316]"
          />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
          >
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[#9ca3af]">
          {mode === "signin" ? "No account? " : "Already have one? "}
          <button onClick={switchMode} className="text-[#F97316] hover:underline">
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
