/**
 * TypewriterText — char-by-char streaming text with cursor.
 *
 * BEO-725: extracted from the legacy ChatMessage.tsx unchanged. Owns its own
 * timer, fires `onDone` exactly once when the full string has been printed,
 * and renders rendered markdown inline via MarkdownText.
 *
 * BEO-729: During animation the partial `displayed` string is rendered as
 * plain text (markdown stripped) so the cursor always stays on the same line.
 * Once done, the full text swaps in as rich MarkdownText.
 */
import { useEffect, useRef, useState } from "react";
import { MarkdownText } from "./MarkdownText";

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onDone?: () => void;
}

function stripMarkdown(t: string): string {
  return t
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`(.*?)`/g, "$1");
}

export function TypewriterText({ text, speed = 20, onDone }: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");
    setDone(false);
    const id = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(id);
        onDoneRef.current?.();
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  if (done) {
    return <MarkdownText text={text} />;
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#374151] break-words">
      {stripMarkdown(displayed)}
      <span className="typewriter-cursor ml-0.5 inline-block align-middle text-[#F97316]">|</span>
    </p>
  );
}
