import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "../../../lib/supabase";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[400px] rounded-xl bg-cream p-10 shadow-lg">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <BeomzLogo className="h-7 w-auto text-[#1a1a1a]" />
        </div>

        <h1 className="mb-8 text-center text-xl font-semibold text-cream-text">
          Create your account
        </h1>

        {submitted ? (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-center">
            <p className="text-sm font-medium text-green-800">
              Check your email to confirm your account
            </p>
            <p className="mt-1 text-xs text-green-600">
              We sent a confirmation link to {email}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
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
            <div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-orange"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password || !confirmPassword}
              className="w-full rounded-lg bg-cream-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cream-accent/90 disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-cream-text/40">
          Already have an account?{" "}
          <Link
            to="/auth/login"
            className="text-cream-accent hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
