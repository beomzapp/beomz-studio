/**
 * ServerRestartedCard — amber friendly disconnect state shown inline in chat.
 * Used when the SSE connection drops mid-build (typically PM2 reload during
 * deploy). Distinct from red buildFailed state — this is infra, not the user.
 */
import { useCallback, useRef, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

interface ServerRestartedCardProps {
  onRetry: () => void;
}

export function ServerRestartedCard({ onRetry }: ServerRestartedCardProps) {
  const [busy, setBusy] = useState(false);
  const clickedRef = useRef(false);

  const handleRetry = useCallback(() => {
    if (clickedRef.current) return;
    clickedRef.current = true;
    setBusy(true);
    try {
      onRetry();
    } catch {
      clickedRef.current = false;
      setBusy(false);
    }
  }, [onRetry]);

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Animated icon */}
        <div className="flex-none">
          <WifiOff size={18} className="mt-0.5 animate-pulse text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-medium text-amber-700"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            Connection lost
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-600">
            The server restarted mid-build. Your progress is safe — please try again in a moment.
          </p>
          <button
            onClick={handleRetry}
            disabled={busy}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-amber-400 px-3 py-1.5 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            <RefreshCw size={11} className={busy ? "animate-spin" : ""} />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
