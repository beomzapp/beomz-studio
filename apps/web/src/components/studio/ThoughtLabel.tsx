/**
 * "Thought for Xs" inline label — BEO-68.
 * Minimal, muted, no spinner or bubble. Just a counting label.
 */
import { useEffect, useState } from "react";

interface ThoughtLabelProps {
  visible: boolean;
}

export function ThoughtLabel({ visible }: ThoughtLabelProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!visible) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <p className="text-xs text-[#9ca3af]">
      Thought for {elapsed}s
    </p>
  );
}
