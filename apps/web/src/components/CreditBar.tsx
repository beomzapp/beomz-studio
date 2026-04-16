/**
 * CreditBar — segmented visual credit display (BEO-346).
 * Four colour zones: used (grey), monthly (blue), rollover (purple), topup (orange).
 * Widths are proportional to each segment's share of the total baseline
 * (used + all remaining). Falls back gracefully when the backend doesn't
 * yet return the three-bucket breakdown.
 */
import { cn } from "../lib/cn";

interface CreditBarProps {
  used?: number;
  monthly: number;
  rollover?: number;
  topup: number;
  /** Total balance (remaining). Used as the single-bar fallback when
   *  monthly/rollover/topup aren't populated. */
  balance: number;
  /** h-1.5 (mini, default), h-2.5 (medium), h-3 (large) */
  size?: "mini" | "medium" | "large";
  className?: string;
  /** When true, shows zone tooltips on hover. Default true. */
  showTooltips?: boolean;
}

const SEGMENT_COLOURS = {
  used: "bg-zinc-300",
  monthly: "bg-blue-500",
  rollover: "bg-purple-500",
  topup: "bg-[#F97316]",
} as const;

const TOOLTIP_BASE =
  "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100";

export function CreditBar({
  used = 0,
  monthly,
  rollover = 0,
  topup,
  balance,
  size = "mini",
  className,
  showTooltips = true,
}: CreditBarProps) {
  const heightClass = size === "large" ? "h-3" : size === "medium" ? "h-2.5" : "h-1.5";

  // If the breakdown is available, use it. Otherwise fall back to a single
  // "monthly-coloured" bar driven by balance only.
  const hasBreakdown = monthly > 0 || rollover > 0 || topup > 0 || used > 0;
  const totalRemaining = hasBreakdown ? monthly + rollover + topup : balance;
  const total = used + totalRemaining;

  // Nothing to show at all — render an empty bar
  if (total === 0) {
    return (
      <div className={cn("w-full overflow-hidden rounded-full bg-zinc-100", heightClass, className)} />
    );
  }

  // When we have no breakdown, the bar is 100% blue (remaining balance).
  if (!hasBreakdown) {
    return (
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-zinc-100",
          heightClass,
          className,
        )}
      >
        <div
          className={cn("h-full", SEGMENT_COLOURS.monthly)}
          style={{ width: "100%" }}
        />
      </div>
    );
  }

  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <div
      className={cn(
        "flex w-full overflow-hidden rounded-full bg-zinc-100",
        heightClass,
        className,
      )}
    >
      {used > 0 && (
        <div
          className={cn("group relative h-full", SEGMENT_COLOURS.used)}
          style={{ width: `${pct(used)}%` }}
        >
          {showTooltips && (
            <span className={TOOLTIP_BASE}>
              Used this period: {Math.round(used)} credits
            </span>
          )}
        </div>
      )}
      {monthly > 0 && (
        <div
          className={cn("group relative h-full transition-[width] duration-300", SEGMENT_COLOURS.monthly)}
          style={{ width: `${pct(monthly)}%` }}
        >
          {showTooltips && (
            <span className={TOOLTIP_BASE}>
              Monthly credits: {Math.round(monthly)} remaining
            </span>
          )}
        </div>
      )}
      {rollover > 0 && (
        <div
          className={cn("group relative h-full transition-[width] duration-300", SEGMENT_COLOURS.rollover)}
          style={{ width: `${pct(rollover)}%` }}
        >
          {showTooltips && (
            <span className={TOOLTIP_BASE}>
              Rollover credits: {Math.round(rollover)}
            </span>
          )}
        </div>
      )}
      {topup > 0 && (
        <div
          className={cn("group relative h-full transition-[width] duration-300", SEGMENT_COLOURS.topup)}
          style={{ width: `${pct(topup)}%` }}
        >
          {showTooltips && (
            <span className={TOOLTIP_BASE}>
              Top-up credits: {Math.round(topup)} (never expire)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
