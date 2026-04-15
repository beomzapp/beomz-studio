/**
 * FeatureScopeCard — interactive pre-build feature scoping card.
 * Rendered in chat when scope_confirmation SSE event fires.
 * User can uncheck features, add extras, then confirm or auto-confirm after 60s.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader, Plus } from "lucide-react";
import { cn } from "../../lib/cn";

interface FeatureScopeCardProps {
  features: string[];
  buildId: string;
  message: string;
  onConfirm: (features: string[], extras: string) => void;
}

export function FeatureScopeCard({
  features,
  buildId,
  message,
  onConfirm,
}: FeatureScopeCardProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of features) init[f] = true;
    return init;
  });
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [locked, setLocked] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const otherInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmedRef = useRef(false);

  const doConfirm = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const selectedFeatures = features.filter((f) => checked[f]);
    const extras = otherChecked ? otherText.trim() : "";
    setLocked(true);
    onConfirm(selectedFeatures, extras);
  }, [features, checked, otherChecked, otherText, onConfirm]);

  // 60s countdown
  useEffect(() => {
    if (locked) return;
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          doConfirm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [locked, doConfirm]);

  const toggleFeature = (f: string) => {
    if (locked) return;
    setChecked((prev) => ({ ...prev, [f]: !prev[f] }));
  };

  const selectedCount = features.filter((f) => checked[f]).length;
  const extrasLabel = otherChecked && otherText.trim() ? ` + extras` : "";

  if (locked) {
    return (
      <div className="mx-2 mb-2 overflow-hidden rounded-xl border border-[#22c55e]/30 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22c55e]">
            <Check size={12} className="text-white" />
          </div>
          <p className="text-[13px] font-medium text-[#374151]" style={{ fontFamily: "DM Sans, sans-serif" }}>
            Building with {selectedCount} feature{selectedCount !== 1 ? "s" : ""}{extrasLabel}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm">
      {/* Intro message */}
      <div className="border-b border-[#f0eeeb] px-3 py-2.5">
        <p className="text-[13px] text-[#374151]" style={{ fontFamily: "DM Sans, sans-serif" }}>
          {message}
        </p>
        <p className="mt-1 text-[11px] text-[#9ca3af]">
          Uncheck anything you don't need:
        </p>
      </div>

      {/* Feature checklist */}
      <div className="max-h-[280px] overflow-y-auto px-1 py-1.5">
        {features.map((f) => (
          <button
            key={f}
            onClick={() => toggleFeature(f)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#faf9f6]"
          >
            <div className={cn(
              "flex h-4 w-4 min-w-[16px] items-center justify-center rounded border transition-colors",
              checked[f]
                ? "border-[#F97316] bg-[#F97316]"
                : "border-[#d1d5db] bg-white",
            )}>
              {checked[f] && <Check size={10} className="text-white" />}
            </div>
            <span className={cn(
              "text-[12px]",
              checked[f] ? "text-[#374151]" : "text-[#9ca3af] line-through",
            )}>
              {f}
            </span>
          </button>
        ))}

        {/* "Other" checkbox */}
        <button
          onClick={() => {
            setOtherChecked((v) => !v);
            if (!otherChecked) setTimeout(() => otherInputRef.current?.focus(), 50);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#faf9f6]"
        >
          <div className={cn(
            "flex h-4 w-4 min-w-[16px] items-center justify-center rounded border transition-colors",
            otherChecked
              ? "border-[#F97316] bg-[#F97316]"
              : "border-[#d1d5db] bg-white",
          )}>
            {otherChecked && <Check size={10} className="text-white" />}
          </div>
          <span className="text-[12px] text-[#6b7280]">Other — please specify:</span>
        </button>

        {/* Other text input — shown when Other is checked */}
        {otherChecked && (
          <div className="px-2 pb-1 pt-0.5">
            <input
              ref={otherInputRef}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="e.g. visitor management, contractor portal"
              className="w-full rounded-lg border border-[#e5e5e5] bg-[#faf9f6] px-2.5 py-1.5 text-[12px] text-[#374151] placeholder:text-[#c4c4c4] outline-none focus:border-[#F97316]/40"
              onKeyDown={(e) => { if (e.key === "Enter") doConfirm(); }}
            />
          </div>
        )}
      </div>

      {/* Footer: buttons + countdown */}
      <div className="border-t border-[#f0eeeb] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={doConfirm}
            className="flex-1 rounded-lg bg-[#F97316] px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#ea6c0e] active:bg-[#d95f0a]"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            Build it &rarr;
          </button>
          <button
            onClick={() => {
              setOtherChecked(true);
              setTimeout(() => otherInputRef.current?.focus(), 50);
            }}
            className="rounded-lg border border-[#e5e5e5] px-3 py-2 text-[12px] font-medium text-[#6b7280] transition-colors hover:bg-[#faf9f6]"
          >
            <Plus size={12} className="mr-1 inline" />
            Add more
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[#c4c4c4]">
          Starting automatically in {countdown}s
        </p>
      </div>
    </div>
  );
}
