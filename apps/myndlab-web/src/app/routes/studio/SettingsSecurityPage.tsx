import { useState, useEffect } from "react";
import { Shield, Smartphone, AlertTriangle } from "lucide-react";
import { supabase } from "../../../lib/supabase";

export function SettingsSecurityPage() {
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthEmail(data.session.user.email ?? null);
        setCreatedAt(data.session.user.created_at ?? null);
      }
    });
  }, []);

  const connectedSince = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const browserLabel =
    typeof navigator !== "undefined"
      ? navigator.userAgent.includes("Chrome")
        ? "Chrome"
        : navigator.userAgent.includes("Firefox")
          ? "Firefox"
          : navigator.userAgent.includes("Safari")
            ? "Safari"
            : "Browser"
      : "Browser";

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Security</h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Manage your connected auth methods and active sessions.
          </p>
        </div>

        {/* Connected auth methods */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <Shield size={18} />
            <h2 className="text-base font-semibold">Connected auth methods</h2>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#f0eeeb] bg-[#faf9f6] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#e5e5e5]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#1a1a1a]">Google OAuth</p>
                <p className="text-xs text-[#6b7280]">
                  {authEmail ?? "—"} · Connected {connectedSince}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-medium text-[#16a34a]">
              Active
            </span>
          </div>
        </section>

        {/* Active sessions */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <Smartphone size={18} />
            <h2 className="text-base font-semibold">Active sessions</h2>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#f0eeeb] bg-[#faf9f6] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#1a1a1a]">Current session</p>
              <p className="text-xs text-[#6b7280]">{browserLabel} · This device</p>
            </div>
            <span className="rounded-full bg-[#F97316]/10 px-2.5 py-0.5 text-xs font-medium text-[#F97316]">
              Current
            </span>
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl border border-red-100 bg-white p-6">
          <div className="mb-3 flex items-center gap-2 text-red-500">
            <AlertTriangle size={18} />
            <h2 className="text-base font-semibold">Danger zone</h2>
          </div>
          <p className="mb-4 text-sm text-[#6b7280]">
            Permanently delete your account and all associated data.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
          >
            Delete account
          </button>
        </section>
      </div>

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <h3 className="text-base font-bold text-[#1a1a1a]">Delete account</h3>
            <p className="mt-2 text-sm text-[#6b7280]">
              To delete your account, please contact our support team at{" "}
              <a
                href="mailto:support@beomz.com?subject=Delete%20my%20account"
                className="font-medium text-[#F97316] underline-offset-2 hover:underline"
              >
                support@beomz.com
              </a>
              . We&rsquo;ll process your request within 48 hours.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="rounded-lg border border-[#e5e5e5] px-4 py-2 text-sm font-medium text-[#374151] transition-colors hover:bg-[#f3f4f6]"
              >
                Close
              </button>
              <a
                href="mailto:support@beomz.com?subject=Delete%20my%20account"
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Contact support
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
