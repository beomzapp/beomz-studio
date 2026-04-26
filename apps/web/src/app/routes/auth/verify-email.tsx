import { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { getApiBaseUrl } from "../../../lib/api";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

type Status = "loading" | "success" | "error";

export function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("Verification failed. The link may have expired.");
  const [requestingNew, setRequestingNew] = useState(false);
  const [newLinkSent, setNewLinkSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setErrorMessage("Invalid verification link.");
      setStatus("error");
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/auth/email/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string };
        if (!res.ok) {
          setErrorMessage(data.error ?? "Verification failed. The link may have expired.");
          setStatus("error");
          return;
        }
        if (data.access_token && data.refresh_token) {
          localStorage.setItem("beomz_access_token", data.access_token);
          localStorage.setItem("beomz_refresh_token", data.refresh_token);
        }
        setStatus("success");
        // Use a full-page navigation so the studio route guard picks up the
        // freshly stored token rather than a stale React router state.
        window.location.href = "/studio/home";
      } catch {
        setErrorMessage("Network error. Please try again.");
        setStatus("error");
      }
    })();
  }, []);

  const handleRequestNewLink = async () => {
    setRequestingNew(true);
    try {
      await fetch(`${getApiBaseUrl()}/auth/email/resend-verification`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      setNewLinkSent(true);
    } catch {
      // silently ignore
    } finally {
      setRequestingNew(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-[#e5e5e5] p-10 shadow-sm text-center">
        <BeomzLogo className="mx-auto mb-8 block h-7 w-auto text-[#1a1a1a]" />

        {status === "loading" && (
          <>
            <Loader2 size={32} className="mx-auto mb-4 animate-spin text-[#F97316]" />
            <h2 className="text-lg font-semibold text-[#1a1a1a]">Verifying your email…</h2>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle size={32} className="mx-auto mb-4 text-green-500" />
            <h2 className="mb-2 text-lg font-semibold text-[#1a1a1a]">Email verified!</h2>
            <p className="text-sm text-[#6b7280]">Taking you to your studio…</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle size={32} className="mx-auto mb-4 text-red-400" />
            <h2 className="mb-2 text-lg font-semibold text-[#1a1a1a]">Verification failed</h2>
            <p className="mb-6 text-sm text-[#6b7280]">{errorMessage}</p>

            {newLinkSent ? (
              <p className="text-sm text-green-600">A new link has been sent to your email.</p>
            ) : (
              <button
                onClick={() => void handleRequestNewLink()}
                disabled={requestingNew}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
              >
                {requestingNew ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Request new link
              </button>
            )}

            <a
              href="/auth/login"
              className="mt-4 block text-sm text-[#9ca3af] hover:text-[#F97316]"
            >
              Back to sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
