import { useEffect, useState } from "react";
import { ArrowRight, PartyPopper } from "lucide-react";
import { cn } from "../../lib/cn";

interface ContinuationCardProps {
  deferredItems: string[];
  completedItems: string[];
  originalPrompt: string;
  phase: number;
  onImplement: (prompt: string) => void;
  light?: boolean;
}

export function ContinuationCard({
  deferredItems,
  completedItems,
  originalPrompt,
  phase,
  onImplement,
  light,
}: ContinuationCardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const remaining = deferredItems.filter((item) => !completedItems.includes(item));
  const allDone = remaining.length === 0;

  return (
    <div
      className={cn(
        "mt-6 rounded-2xl border p-6 transition-all duration-500",
        light
          ? "border-[#e8580a]/15 bg-white shadow-sm"
          : "border-orange/20 bg-[#060612] shadow-[0_0_30px_-10px_rgba(249,115,22,0.15)]",
        mounted
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      )}
    >
      <div className="mb-4">
        <h3 className={light ? "text-lg font-semibold text-[#1a1a1a]" : "text-lg font-semibold text-white"}>
          Phase {phase} complete{" "}
          <span className="text-green-400">✓</span>
        </h3>
        <p className={light ? "mt-1 text-sm text-[rgba(0,0,0,0.4)]" : "mt-1 text-sm text-white/40"}>What&apos;s next?</p>
      </div>

      {allDone ? (
        <div className="flex items-center gap-3 rounded-xl bg-orange/10 px-4 py-3">
          <PartyPopper size={20} className="text-orange" />
          <span className="text-sm font-medium text-orange">
            All phases complete!
          </span>
        </div>
      ) : (
        <ul className="space-y-2">
          {remaining.map((item) => (
            <li
              key={item}
              className={
                light
                  ? "flex items-center justify-between rounded-xl border border-[rgba(0,0,0,0.07)] bg-[rgba(0,0,0,0.01)] px-4 py-3"
                  : "flex items-center justify-between rounded-xl border border-border bg-white/[0.02] px-4 py-3"
              }
            >
              <span className={light ? "text-sm text-[rgba(0,0,0,0.6)]" : "text-sm text-white/70"}>{item}</span>
              <button
                onClick={() =>
                  onImplement(`Build ${item} for: ${originalPrompt}`)
                }
                className="flex items-center gap-1.5 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange/90"
              >
                Implement
                <ArrowRight size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
