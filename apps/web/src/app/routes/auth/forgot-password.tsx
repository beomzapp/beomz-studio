import { useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { getApiBaseUrl } from "../../../lib/api";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/email/forgot-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-[#e5e5e5] p-10 shadow-sm">
        <BeomzLogo className="mx-auto mb-8 block h-7 w-auto text-[#1a1a1a]" />

        {submitted ? (
          <div className="text-center">
            <h2 className="mb-2 text-lg font-semibold text-[#1a1a1a]">Check your email</h2>
            <p className="mb-6 text-sm text-[#6b7280]">
              If that email exists, a reset link has been sent.
            </p>
            <a href="/auth/login" className="text-sm text-[#F97316] hover:underline">
              Back to sign in
            </a>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-center text-lg font-semibold text-[#1a1a1a]">
              Reset your password
            </h2>
            <p className="mb-6 text-center text-sm text-[#9ca3af]">
              Enter your email and we'll send a reset link.
            </p>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                autoFocus
                className="w-full rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder-[#1a1a1a]/30 outline-none focus:border-[#F97316]"
              />

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading || !email}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Send reset link
              </button>
            </form>

            <a
              href="/auth/login"
              className="mt-4 flex items-center justify-center gap-1 text-sm text-[#9ca3af] hover:text-[#F97316]"
            >
              <ArrowLeft size={13} />
              Back to sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
