/**
 * InlineConfirmation — BEO-804
 *
 * Replaces PlanCard for iteration confirmations in the v2 chat panel.
 * Renders a 1–2 sentence summary with either:
 *   - High confidence (≥ 0.85): auto-implement countdown bar + Implement now / Cancel
 *   - Low confidence (< 0.85): manual → Implement button
 *
 * No card wrapper, no border, no shadow, no background. Inline content only.
 * Wiring into the live chat panel is Phase 3 — this file is a visual spike only.
 */
import { useState, useEffect, useRef } from "react";
import { BAvatar } from "../Avatars";

export interface InlineConfirmationProps {
  summary: string;
  cta: { label: string };
  confidence: number;
  autoImplementDurationMs?: number;
  onImplement: () => void;
  onCancel: () => void;
}

export function InlineConfirmation({
  summary,
  cta,
  confidence,
  autoImplementDurationMs = 5000,
  onImplement,
  onCancel,
}: InlineConfirmationProps) {
  const isHighConfidence = confidence >= 0.85;

  const [cancelled, setCancelled] = useState(false);
  const [remainingMs, setRemainingMs] = useState(autoImplementDurationMs);
  const [barReady, setBarReady] = useState(false);

  const firedRef = useRef(false);
  const onImplementRef = useRef(onImplement);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onImplementRef.current = onImplement; });
  useEffect(() => { onCancelRef.current = onCancel; });

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Countdown + bar animation — high-confidence only
  useEffect(() => {
    if (!isHighConfidence || cancelled) return;

    // Trigger the bar's CSS transition on the next paint
    const raf = requestAnimationFrame(() => setBarReady(true));

    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          clearInterval(interval);
          if (!firedRef.current) {
            firedRef.current = true;
            onImplementRef.current();
          }
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
    };
  // cancelled is intentionally in deps so cleanup runs on cancel
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHighConfidence, cancelled]);

  function handleImplementNow() {
    if (firedRef.current) return;
    firedRef.current = true;
    onImplementRef.current();
  }

  function handleCancel() {
    setCancelled(true);
    onCancelRef.current();
  }

  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <div
      className="flex items-start gap-2"
      style={{ animation: "fadeIn 200ms ease-out both" }}
    >
      <BAvatar />

      <div className="min-w-0 flex-1">
        {/* Summary — Body type */}
        <p className="text-[14px] leading-[1.55] tracking-[-0.01em] text-[#374151]">
          {summary}
        </p>

        {/* High-confidence: countdown bar + controls */}
        {isHighConfidence && !cancelled && (
          <div className="mt-2">
            {/* 2px countdown bar */}
            <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-zinc-500/15">
              <div
                className="absolute inset-0 bg-zinc-500"
                style={{
                  transformOrigin: "left",
                  transform: barReady && !reducedMotion ? "scaleX(0)" : "scaleX(1)",
                  transition:
                    barReady && !reducedMotion
                      ? `transform ${autoImplementDurationMs}ms linear`
                      : "none",
                }}
              />
            </div>

            {/* Controls row */}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              {/* Caption — Meta type */}
              <span className="text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                auto-implementing in {secondsLeft}s
              </span>

              {/* Actions — Small-label type */}
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={handleImplementNow}
                  className="text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-[#00D5D8] transition-colors hover:text-[#ea6c10]"
                >
                  → Implement now
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-500 transition-colors hover:text-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Low-confidence: single manual CTA aligned right */}
        {!isHighConfidence && (
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={onImplement}
              className="text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-[#00D5D8] transition-colors hover:text-[#ea6c10]"
            >
              → {cta.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
