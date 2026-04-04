import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "../../../lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate({ to: "/studio/home" });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[400px] rounded-xl bg-cream p-10 shadow-lg">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <path
              d="M8 8h8v8H8V8Zm0 16h8v8H8v-8Zm16-16h8v8h-8V8Zm0 16h8v8h-8v-8Zm-8-8h8v8h-8v-8Z"
              fill="#060612"
            />
          </svg>
        </div>

        <h1 className="mb-8 text-center text-xl font-semibold text-cream-text">
          Sign in to Beomz
        </h1>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#e2e2e2] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] transition-shadow hover:shadow-md disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#e2e2e2]" />
          <span className="text-xs text-cream-text/40">or</span>
          <div className="h-px flex-1 bg-[#e2e2e2]" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-orange"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-orange"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-cream-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cream-accent/90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-cream-text/40">
          Don't have an account?{" "}
          <Link
            to="/auth/signup"
            className="text-cream-accent hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
