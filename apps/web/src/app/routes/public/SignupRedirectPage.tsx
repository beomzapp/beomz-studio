/**
 * SignupRedirectPage — BEO-616 Bug 7
 * Handles /signup?ref=CODE referral entry point.
 * Checks for VPN before crediting the referrer:
 *   - VPN detected  → show warning overlay; let user decide
 *   - No VPN / error → redirect to / immediately
 * The referral code was already saved to localStorage by the route's beforeLoad.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getApiBaseUrl } from "../../../lib/api";

async function fetchVpnStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/check-vpn`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { is_vpn?: boolean };
    return data.is_vpn === true;
  } catch {
    return false;
  }
}

export function SignupRedirectPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [vpnDetected, setVpnDetected] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  useEffect(() => {
    fetchVpnStatus().then((isVpn) => {
      if (isVpn) {
        setVpnDetected(true);
      } else {
        void navigate({ to: "/" });
      }
      setChecking(false);
    });
  }, [navigate]);

  const handleRecheck = async () => {
    setRechecking(true);
    const isVpn = await fetchVpnStatus();
    if (!isVpn) {
      void navigate({ to: "/" });
    } else {
      setRechecking(false);
    }
  };

  const handleContinueAnyway = () => {
    void navigate({ to: "/" });
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  }

  if (!vpnDetected) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
          ⚠️
        </div>

        {/* Title */}
        <h2
          className="text-xl font-bold text-[#1a1a1a]"
          style={{ fontFamily: "DM Sans, sans-serif" }}
        >
          VPN Detected
        </h2>

        {/* Body */}
        <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
          You're connected to a VPN. Referral bonuses won't apply while using a
          VPN.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">
          Turn off your VPN before signing up to receive the referral bonus.
        </p>

        {/* CTA — re-check VPN */}
        <button
          type="button"
          onClick={() => void handleRecheck()}
          disabled={rechecking}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
        >
          {rechecking ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Checking VPN…
            </>
          ) : (
            "Turn off VPN, then continue →"
          )}
        </button>

        {/* Skip — continue without bonus */}
        <button
          type="button"
          onClick={handleContinueAnyway}
          className="mt-3 w-full text-center text-sm text-[#9ca3af] transition-colors hover:text-[#6b7280]"
        >
          Continue anyway (no bonus)
        </button>
      </div>
    </div>
  );
}
