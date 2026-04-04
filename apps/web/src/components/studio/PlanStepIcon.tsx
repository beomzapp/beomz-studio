/**
 * Animated plan step status icon (BEO-134).
 * Crossfades between pending circle, spinning ring, checkmark, and error X.
 */

interface PlanStepIconProps {
  status: "pending" | "running" | "done" | "error";
  size?: number;
}

export function PlanStepIcon({ status, size = 16 }: PlanStepIconProps) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Pending — empty circle */}
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        className="absolute inset-0 transition-opacity duration-150 ease-in"
        style={{ opacity: status === "pending" ? 0.4 : 0 }}
        aria-hidden
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-white"
        />
      </svg>

      {/* Running — spinning ring */}
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        className="plan-step-icon-spin absolute inset-0 transition-opacity duration-150 ease-in"
        style={{
          opacity: status === "running" ? 1 : 0,
          animation: status === "running" ? "spin-ring 1s linear infinite" : "none",
        }}
        aria-hidden
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          stroke="var(--color-orange)"
          strokeWidth="1.5"
          strokeDasharray="30 12"
          strokeLinecap="round"
        />
      </svg>

      {/* Done — checkmark */}
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        className="plan-step-icon-pop absolute inset-0 transition-opacity duration-200 ease-out"
        style={{
          opacity: status === "done" ? 1 : 0,
          animation: status === "done" ? "checkmark-pop 150ms ease-out" : "none",
        }}
        aria-hidden
      >
        <circle cx="8" cy="8" r="7" fill="var(--color-success)" />
        <path
          d="M5 8.2l2 2 4-4.4"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Error — X */}
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        className="absolute inset-0 transition-opacity duration-200 ease-out"
        style={{ opacity: status === "error" ? 1 : 0 }}
        aria-hidden
      >
        <circle cx="8" cy="8" r="7" fill="none" stroke="#f87171" strokeWidth="1.5" />
        <path
          d="M5.5 5.5l5 5M10.5 5.5l-5 5"
          stroke="#f87171"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      {/* SR label */}
      <span className="sr-only">{status}</span>
    </span>
  );
}
