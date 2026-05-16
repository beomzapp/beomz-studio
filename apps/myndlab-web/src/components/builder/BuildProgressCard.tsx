/**
 * BuildProgressCard — the live "build in progress" UI.
 *
 * Two render shapes (BEO-725):
 *
 * 1) `<BuildProgressCard.Shimmer />`
 *    Ambient progress card driven by a local timer. Shown when isBuilding
 *    is true and no `building` message has been added to the chat yet.
 *    Iteration variant collapses the 4 steps into "Editing your app...".
 *
 * 2) `<BuildProgressCard message={...} />`
 *    Renders an existing `building` chat message (resumed from session
 *    storage or driven by stage_* SSE events). Steps animate ○ → ✓ as the
 *    `checklist` array updates. Shows file-write progress + an elapsed
 *    timer pinned to the bottom-right of the card.
 *
 * The 4 steps shown to the user are always:
 *   ○ Planning the structure   → ✓
 *   ○ Writing components       → ✓
 *   ○ Polishing the code       → ✓
 *   ○ Starting your preview    → ✓
 */
import { useEffect, useState } from "react";
import type { ChatChecklistStatus, ChatMessage } from "@beomz-studio/contracts";
import { BAvatar } from "./Avatars";

const SHIMMER_STEPS = [
  "Planning the structure",
  "Writing components",
  "Polishing the code",
  "Starting your preview",
] as const;

const SHIMMER_STEP_DURATIONS_MS = [30_000, 180_000, 60_000, 30_000] as const;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ChecklistGlyph({ status }: { status: ChatChecklistStatus }) {
  switch (status) {
    case "active":
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <span className="checklist-orb-active h-5 w-5 rounded-full bg-[#F97316]" />
        </span>
      );
    case "done":
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[15px] text-emerald-600/70">
          ✓
        </span>
      );
    case "failed":
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-[15px] text-red-500">
          ✕
        </span>
      );
    case "pending":
    default:
      return (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <span className="h-3 w-3 rounded-full border-[1.5px] border-zinc-300" />
        </span>
      );
  }
}

function useElapsedSeconds(buildStartedAt: number, buildFrozenAt?: number): number {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor(((buildFrozenAt ?? Date.now()) - buildStartedAt) / 1000),
  );
  useEffect(() => {
    if (buildFrozenAt !== undefined) {
      setElapsed(Math.floor((buildFrozenAt - buildStartedAt) / 1000));
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - buildStartedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [buildStartedAt, buildFrozenAt]);
  return elapsed;
}

function ElapsedTimer({
  buildStartedAt,
  buildFrozenAt,
}: {
  buildStartedAt: number;
  buildFrozenAt?: number;
}) {
  const elapsed = useElapsedSeconds(buildStartedAt, buildFrozenAt);
  return <span className="tabular-nums font-mono text-sm text-zinc-400">{formatElapsed(elapsed)}</span>;
}

// ─── Shimmer (ambient, no message yet) ────────────────────────────────────────

interface ShimmerProps {
  isIteration?: boolean;
}

function Shimmer({ isIteration = false }: ShimmerProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const intervalId = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    let runningTotal = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < SHIMMER_STEP_DURATIONS_MS.length - 1; i++) {
      runningTotal += SHIMMER_STEP_DURATIONS_MS[i];
      const nextStep = i + 1;
      timers.push(setTimeout(() => setActiveStep(nextStep), runningTotal));
    }

    return () => {
      clearInterval(intervalId);
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  if (isIteration) {
    return (
      <div className="flex items-start gap-2 py-1">
        <BAvatar />
        <div className="min-w-0 flex-1">
          <div className="rounded-lg border border-[#e5e5e5] bg-white/80 px-3 py-2.5">
            <ul className="space-y-0">
              <li className="flex min-h-[40px] items-center gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  <span className="checklist-orb-active h-5 w-5 rounded-full bg-[#F97316]" />
                </span>
                <span className="build-shimmer-text text-[15px] font-medium">Editing your app...</span>
              </li>
            </ul>
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-zinc-400">
                Usually takes 1–2 min
                {elapsedSeconds > 0 && ` · ${formatElapsed(elapsedSeconds)} elapsed`}
              </p>
              <p className="text-xs text-zinc-400">~20 credits</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1">
      <BAvatar />
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-[#e5e5e5] bg-white/80 px-3 py-2.5">
          <ul className="space-y-0">
            {SHIMMER_STEPS.map((label, idx) => {
              const isDone = idx < activeStep;
              const isActive = idx === activeStep;
              if (idx > activeStep) return null;
              return (
                <li key={label} className="flex min-h-[40px] items-center gap-3">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    {isDone ? (
                      <span className="text-[15px] text-emerald-600/70">✓</span>
                    ) : isActive ? (
                      <span className="checklist-orb-active h-5 w-5 rounded-full bg-[#F97316]" />
                    ) : (
                      <span className="h-3 w-3 rounded-full border-[1.5px] border-zinc-300" />
                    )}
                  </span>
                  <span
                    className={
                      isDone
                        ? "text-[15px] text-zinc-400"
                        : isActive
                          ? "build-shimmer-text text-[15px] font-medium"
                          : "text-[15px] text-zinc-400"
                    }
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 space-y-0.5">
            <p className="text-xs text-zinc-400">
              Usually takes 3–5 min
              {elapsedSeconds > 0 && ` · ${formatElapsed(elapsedSeconds)} elapsed`}
            </p>
            <p className="text-xs text-zinc-400">~40–55 credits</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Live (drives off a `building` message in the chat) ───────────────────────

type BuildingMsg = Extract<ChatMessage, { type: "building" }>;

interface LiveProps {
  message: BuildingMsg;
}

function Live({ message }: LiveProps) {
  const { checklist, filesWritten, totalFiles, buildStartedAt, buildFrozenAt } = message;

  const showFileCount =
    typeof filesWritten === "number" && typeof totalFiles === "number" && totalFiles > 0;
  const fileLine = showFileCount ? `Writing file ${filesWritten} of ${totalFiles}…` : null;

  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 space-y-3 break-words">
        {checklist && checklist.length > 0 && (
          <div className="relative rounded-lg border border-[#e5e5e5] bg-white/80 px-3 py-2.5 pr-16">
            <ul className="space-y-0">
              {checklist.map(item => (
                <li key={item.id} className="flex min-h-[40px] items-center gap-3">
                  <ChecklistGlyph status={item.status} />
                  <span
                    className={
                      item.status === "pending"
                        ? "text-[15px] text-zinc-400"
                        : item.status === "active"
                          ? "text-[15px] font-medium text-[#374151]"
                          : item.status === "failed"
                            ? "text-[15px] text-red-600/90"
                            : "text-[15px] text-zinc-600"
                    }
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            {typeof buildStartedAt === "number" && (
              <div className="pointer-events-none absolute bottom-2 right-3">
                <ElapsedTimer buildStartedAt={buildStartedAt} buildFrozenAt={buildFrozenAt} />
              </div>
            )}
            {fileLine && <p className="mt-2 text-xs text-zinc-400">{fileLine}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export const BuildProgressCard = Object.assign(Live, { Shimmer });
