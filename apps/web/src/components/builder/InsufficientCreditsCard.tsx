/**
 * InsufficientCreditsCard — shown instead of FeatureScopeCard when a user's
 * credit balance can't cover a complex build.
 * Two paths: Upgrade (opens PricingModal) OR Build simpler version (force-simple API).
 */
import { useCallback, useRef, useState } from "react";
import { Check, Zap } from "lucide-react";
import { cn } from "../../lib/cn";

interface InsufficientCreditsCardProps {
  available: number;
  required: number;
  features: string[];
  buildId: string;
  onUpgrade: () => void;
  onSimpleBuild: () => void;
}

const SIMPLE_BUILD_COST = 6; // BEO-345: rescaled from 23 (same real API cost)

export function InsufficientCreditsCard({
  available,
  required,
  features,
  buildId: _buildId,
  onUpgrade,
  onSimpleBuild,
}: InsufficientCreditsCardProps) {
  const [locked, setLocked] = useState<"upgrade" | "simple" | null>(null);
  const [busy, setBusy] = useState(false);
  const clickedRef = useRef(false);

  const handleUpgrade = useCallback(() => {
    if (clickedRef.current) return;
    clickedRef.current = true;
    setLocked("upgrade");
    onUpgrade();
  }, [onUpgrade]);

  const handleSimple = useCallback(async () => {
    if (clickedRef.current) return;
    clickedRef.current = true;
    setBusy(true);
    try {
      await Promise.resolve(onSimpleBuild());
      setLocked("simple");
    } catch {
      // Re-allow a retry
      clickedRef.current = false;
    } finally {
      setBusy(false);
    }
  }, [onSimpleBuild]);

  if (locked === "simple") {
    return (
      <div className="mx-2 mb-2 overflow-hidden rounded-2xl border border-[#22c55e]/30 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22c55e]">
            <Check size={12} className="text-white" />
          </div>
          <p className="text-[13px] font-medium text-[#374151]" style={{ fontFamily: "DM Sans, sans-serif" }}>
            Building a simpler version...
          </p>
        </div>
      </div>
    );
  }

  if (locked === "upgrade") {
    return (
      <div className="mx-2 mb-2 overflow-hidden rounded-2xl border border-[#F97316]/30 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F97316]">
            <Zap size={12} className="text-white" />
          </div>
          <p className="text-[13px] font-medium text-[#374151]" style={{ fontFamily: "DM Sans, sans-serif" }}>
            Opening upgrade options...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-[#f0eeeb] px-3 py-2.5">
        <p className="text-[13px] font-semibold text-[#1a1a1a]" style={{ fontFamily: "DM Sans, sans-serif" }}>
          Not enough credits for this build
        </p>
        <p className="mt-1 text-[11px] text-[#6b7280]">
          You have <span className="font-semibold text-[#F97316]">{available} credits</span>.
          {" "}This app needs <span className="font-semibold text-[#374151]">~{required} credits</span>.
        </p>
      </div>

      {/* Feature list — read-only preview of what the full build includes */}
      <div className="max-h-[220px] overflow-y-auto px-1 py-1.5">
        <p className="px-2 pb-1 pt-0.5 text-[11px] text-[#9ca3af]">
          Here's what you'd get with a full build:
        </p>
        {features.map((f) => (
          <div
            key={f}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-left"
          >
            <div className={cn(
              "flex h-4 w-4 min-w-[16px] items-center justify-center rounded border border-[#d1d5db] bg-white opacity-50",
            )}>
              <Check size={10} className="text-[#9ca3af]" />
            </div>
            <span className="text-[12px] text-[#9ca3af]">{f}</span>
          </div>
        ))}
      </div>

      {/* Footer: actions */}
      <div className="border-t border-[#f0eeeb] px-3 py-2.5">
        <button
          onClick={handleUpgrade}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#ea6c0e] active:bg-[#d95f0a] disabled:opacity-50"
          style={{ fontFamily: "DM Sans, sans-serif" }}
        >
          <Zap size={12} />
          Upgrade to Pro Starter &rarr;
        </button>
        <button
          onClick={handleSimple}
          disabled={busy}
          className="mt-2 w-full rounded-lg border border-[#e5e5e5] px-3 py-2 text-[12px] font-medium text-[#6b7280] transition-colors hover:bg-[#faf9f6] disabled:opacity-50"
        >
          {busy
            ? "Starting simpler build..."
            : `Build simpler version (~${SIMPLE_BUILD_COST} credits)`}
        </button>
      </div>
    </div>
  );
}
