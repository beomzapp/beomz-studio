import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { getApiBaseUrl } from "../../../lib/api";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/email/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Reset failed. The link may have expired.");
        setLoading(false);
        return;
      }
      // Redirect to sign in with success notice via query param
      void navigate({ to: "/auth/login", search: { _pwreset: "1" } as never });
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

        <h2 className="mb-1 text-center text-lg font-semibold text-[#1a1a1a]">
          Set new password
        </h2>
        <p className="mb-6 text-center text-sm text-[#9ca3af]">
          Choose a strong password for your account.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
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
            disabled={loading || !password || !confirmPassword}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Update password
          </button>
        </form>

        <a
          href="/auth/login"
          className="mt-4 flex items-center justify-center gap-1 text-sm text-[#9ca3af] hover:text-[#F97316]"
        >
          <ArrowLeft size={13} />
          Back to sign in
        </a>
      </div>
    </div>
  );
}
