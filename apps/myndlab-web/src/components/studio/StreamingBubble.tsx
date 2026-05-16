interface StreamingBubbleProps {
  done: boolean;
  light?: boolean;
  text: string;
}

export function StreamingBubble({
  done,
  light,
  text,
}: StreamingBubbleProps) {
  return (
    <div
      className={
        light
          ? "rounded-3xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-4 text-left shadow-sm"
          : "rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left"
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F97316]/15 text-xs font-bold text-[#F97316]">
          B
        </div>
        <span className={light ? "text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(0,0,0,0.35)]" : "text-xs font-semibold uppercase tracking-[0.2em] text-white/35"}>
          Plan mode
        </span>
      </div>
      <p className={light ? "whitespace-pre-wrap text-sm leading-7 text-[#1a1a1a]" : "whitespace-pre-wrap text-sm leading-7 text-white/85"}>
        {text}
        {!done && <span className="ml-0.5 inline-block text-[#F97316] [animation:blink_1s_steps(1)_infinite]">|</span>}
      </p>
    </div>
  );
}
