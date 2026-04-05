/**
 * PlanTypewriter — character-by-character text animation.
 * Ported from V1.
 */
import { useEffect, useState } from "react";

interface PlanTypewriterProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

export function PlanTypewriter({
  text,
  speed = 14,
  onComplete,
}: PlanTypewriterProps) {
  const [displayed, setDisplayed] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (idx >= text.length) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => {
      setDisplayed((d) => d + text[idx]);
      setIdx((i) => i + 1);
    }, speed);
    return () => clearTimeout(timer);
  }, [idx, text, speed, onComplete]);

  return <span>{displayed}</span>;
}
