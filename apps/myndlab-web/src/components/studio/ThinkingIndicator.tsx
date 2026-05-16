/**
 * "Thinking..." micro-state indicator with streaming shimmer (BEO-134).
 * Fades in/out based on `visible` prop.
 */

interface ThinkingIndicatorProps {
  visible: boolean;
  light?: boolean;
}

export function ThinkingIndicator({ visible, light }: ThinkingIndicatorProps) {
  return (
    <div
      className="overflow-hidden transition-all duration-200 ease-out"
      style={{
        maxHeight: visible ? 32 : 0,
        opacity: visible ? 1 : 0,
        marginBottom: visible ? 12 : 0,
      }}
    >
      <span className={light ? "streaming-shimmer text-sm font-medium text-[rgba(0,0,0,0.5)]" : "streaming-shimmer text-sm font-medium text-white/70"}>
        Thinking...
      </span>
    </div>
  );
}
