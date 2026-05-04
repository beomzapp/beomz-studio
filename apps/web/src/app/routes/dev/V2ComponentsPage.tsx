/**
 * V2ComponentsPage — BEO-804 / BEO-805 / BEO-808
 *
 * DEV-ONLY preview route for v2 chat-panel components.
 * Accessible at /dev/v2-components in development builds, or in production
 * when localStorage "beomz:devMode" === "true" (BEO-805 gate).
 */
import { useReducer, useState } from "react";
import {
  EXAMPLE_BUILD_COMPLETE,
  EXAMPLE_TURN_COMPLETE,
  EXAMPLE_TURN_STARTED,
} from "@beomz-studio/contracts";
import { InlineConfirmation } from "../../../components/builder/v2";
import { LiveStatusPill } from "../../../components/builder/LiveStatusPill";
import { chatV2Reducer, initialChatState } from "../../../hooks/useBuildChatV2";

interface CardConfig {
  label: string;
  summary: string;
  confidence: number;
  autoImplementDurationMs?: number;
}

const CARDS: CardConfig[] = [
  {
    label: "High-confidence iteration (0.92)",
    summary: "Switching to a playful pastel theme. Existing features stay as-is.",
    confidence: 0.92,
    autoImplementDurationMs: 5000,
  },
  {
    label: "High-confidence redesign (0.91)",
    summary:
      "Adopting a more brutalist look — thicker borders, mono headings, monospace body. Functionality preserved.",
    confidence: 0.91,
    autoImplementDurationMs: 5000,
  },
  {
    label: "Low-confidence iteration (0.72) — manual click",
    summary: "Adding a streak counter to each habit card.",
    confidence: 0.72,
  },
  {
    label: "High-confidence, short window (0.95, 3s)",
    summary: "Renaming the app to FocusList.",
    confidence: 0.95,
    autoImplementDurationMs: 3000,
  },
];

const PILL_STATES: { label: string; currentAction: string | null }[] = [
  { label: "Idle / no action", currentAction: null },
  {
    label: "Tool: createFile · path=components/TaskList.tsx",
    currentAction: "Writing components/TaskList.tsx",
  },
  {
    label: "Tool: editFile · path=manifest.json",
    currentAction: "Editing manifest.json",
  },
  {
    label: "Tool: readFile · path=vite.config.ts",
    currentAction: "Reading vite.config.ts",
  },
  { label: "Tool: runMigration", currentAction: "Running migrations" },
  { label: "Tool: deploy", currentAction: "Updating preview" },
  { label: "Phase: classifying", currentAction: "Understanding your request" },
  { label: "Phase: generating", currentAction: "Writing components" },
  { label: "Phase: persisting", currentAction: "Saving changes" },
  {
    label: "Long path — truncation test",
    currentAction:
      "Writing apps/web/src/components/builder/v2/InlineConfirmationCountdownTimerWrapper.tsx",
  },
];

// ─── BEO-808: Reducer state inspector ────────────────────────────────────────

/**
 * Five-step fixture sequence mirroring a minimal build turn:
 *   1. TURN_STARTED
 *   2. STATE — classifying
 *   3. STATE — building
 *   4. BUILD_COMPLETE
 *   5. TURN_COMPLETE
 */
const SIMULATE_STEPS: Array<{ label: string; dispatch: () => Parameters<typeof chatV2Reducer>[1] }> =
  [
    {
      label: "TURN_STARTED",
      dispatch: () => ({ type: "TURN_STARTED" as const, payload: EXAMPLE_TURN_STARTED }),
    },
    {
      label: 'STATE — classifying',
      dispatch: () => ({
        type: "STATE" as const,
        payload: { type: "state" as const, phase: "classifying" as const },
      }),
    },
    {
      label: "STATE — building",
      dispatch: () => ({
        type: "STATE" as const,
        payload: { type: "state" as const, phase: "building" as const },
      }),
    },
    {
      label: "BUILD_COMPLETE",
      dispatch: () => ({ type: "BUILD_COMPLETE" as const, payload: EXAMPLE_BUILD_COMPLETE }),
    },
    {
      label: "TURN_COMPLETE",
      dispatch: () => ({ type: "TURN_COMPLETE" as const, payload: EXAMPLE_TURN_COMPLETE }),
    },
  ];

interface StepLog {
  step: number;
  label: string;
  phase: string;
  messageCount: number;
}

function ReducerInspector() {
  const [state, dispatch] = useReducer(chatV2Reducer, initialChatState);
  const [stepIdx, setStepIdx] = useState(0);
  const [log, setLog] = useState<StepLog[]>([]);

  function advance() {
    if (stepIdx >= SIMULATE_STEPS.length) return;
    const step = SIMULATE_STEPS[stepIdx];
    const action = step.dispatch();
    dispatch(action);
    // Log is appended after dispatch; React will re-render with new state after this,
    // so we derive next state ourselves for the log entry.
    const next = chatV2Reducer(state, action);
    setLog((prev) => [
      ...prev,
      { step: stepIdx + 1, label: step.label, phase: next.phase, messageCount: next.messages.length },
    ]);
    setStepIdx((i) => i + 1);
  }

  function reset() {
    dispatch({ type: "USER_RETRIED", payload: { errorCode: "reset" } });
    // Full reset: re-init by dispatching a synthetic reset via re-mounting trick
    setStepIdx(0);
    setLog([]);
  }

  const isDone = stepIdx >= SIMULATE_STEPS.length;
  const nextStep = SIMULATE_STEPS[stepIdx];

  return (
    <section id="use-build-chat-v2" className="mt-14">
      <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
        useBuildChatV2 — reducer state inspector
      </h2>
      <p className="mb-6 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
        BEO-808 · 5-step fixture sequence (TURN_STARTED → STATE×2 → BUILD_COMPLETE → TURN_COMPLETE)
      </p>

      {/* Current state */}
      <div className="mb-4 rounded-md border border-zinc-200 bg-white px-4 py-3">
        <p className="text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
          Current state
        </p>
        <div className="mt-2 flex gap-6">
          <div>
            <p className="text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-500">
              phase
            </p>
            <p className="text-[12px] leading-[1.4] tracking-[-0.005em] text-[#111]">
              {state.phase}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-500">
              messages
            </p>
            <p className="text-[12px] leading-[1.4] tracking-[-0.005em] text-[#111]">
              {state.messages.length}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-500">
              turnId
            </p>
            <p className="text-[12px] leading-[1.4] tracking-[-0.005em] text-[#111]">
              {state.turnId ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-500">
              step
            </p>
            <p className="text-[12px] leading-[1.4] tracking-[-0.005em] text-[#111]">
              {stepIdx} / {SIMULATE_STEPS.length}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 flex gap-3">
        <button
          type="button"
          onClick={advance}
          disabled={isDone}
          className="rounded-md bg-[#111] px-4 py-1.5 text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isDone ? "Sequence complete" : `Simulate turn · step ${stepIdx + 1}: ${nextStep?.label}`}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
        >
          Reset
        </button>
      </div>

      {/* Step log */}
      {log.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-2">
            <p className="text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
              Step log
            </p>
          </div>
          <div className="divide-y divide-zinc-100">
            {log.map((entry) => (
              <div key={entry.step} className="flex items-center gap-6 px-4 py-2">
                <span className="w-5 text-right text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-400">
                  {entry.step}
                </span>
                <span className="flex-1 font-mono text-[12px] leading-[1.5] text-zinc-700">
                  {entry.label}
                </span>
                <span className="text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                  phase=<strong className="text-[#111]">{entry.phase}</strong>
                </span>
                <span className="text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                  msgs=<strong className="text-[#111]">{entry.messageCount}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function V2ComponentsPage() {
  const [globalReset, setGlobalReset] = useState(0);
  const [cardKeys, setCardKeys] = useState([0, 0, 0, 0]);

  function remountCard(idx: number) {
    setCardKeys((prev) => prev.map((k, i) => (i === idx ? k + 1 : k)));
  }

  function resetAll() {
    setGlobalReset((n) => n + 1);
    setCardKeys([0, 0, 0, 0]);
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] px-8 py-10">
      {/* Sticky section nav — BEO-805 / BEO-808 */}
      <nav className="sticky top-0 z-10 mb-4 flex gap-3 border-b border-zinc-200 bg-white/95 px-4 py-2 text-[12px] leading-[1.4] tracking-[-0.005em] backdrop-blur">
        <a href="#inline-confirmation">InlineConfirmation</a>
        <a href="#live-status-pill">LiveStatusPill</a>
        <a href="#phase-indicator">Phase indicator</a>
        <a href="#shimmer">Shimmer variants</a>
        <a href="#use-build-chat-v2">useBuildChatV2</a>
      </nav>

      <div className="mx-auto max-w-xl">
        {/* ── InlineConfirmation ── */}
        <section id="inline-confirmation">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1
                className="text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]"
              >
                v2 Components — dev preview
              </h1>
              <p className="mt-0.5 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                BEO-804 · InlineConfirmation visual spike
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
            >
              Reset all
            </button>
          </div>

          <div className="flex flex-col gap-8">
            {CARDS.map((card, idx) => (
              <section key={idx}>
                <p className="mb-2 text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-400 uppercase">
                  {card.label}
                </p>
                <InlineConfirmation
                  key={globalReset * 100 + cardKeys[idx]}
                  summary={card.summary}
                  cta={{ label: "Implement" }}
                  confidence={card.confidence}
                  autoImplementDurationMs={card.autoImplementDurationMs}
                  onImplement={() => {
                    console.log(`[BEO-804] onImplement — card ${idx}: "${card.summary}"`);
                    remountCard(idx);
                  }}
                  onCancel={() => {
                    console.log(`[BEO-804] onCancel — card ${idx}: "${card.summary}"`);
                    remountCard(idx);
                  }}
                />
              </section>
            ))}
          </div>
        </section>

        {/* ── LiveStatusPill ── */}
        <section id="live-status-pill" className="mt-14">
          <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
            LiveStatusPill
          </h2>
          <p className="mb-6 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
            BEO-805 · 10 states
          </p>
          <div className="flex flex-col gap-5">
            {PILL_STATES.map(({ label, currentAction }, idx) => (
              <div key={idx}>
                <p className="mb-1.5 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                  {label}
                </p>
                <LiveStatusPill currentAction={currentAction} />
              </div>
            ))}
          </div>
        </section>

        {/* ── Phase indicator ── */}
        <section id="phase-indicator" className="mt-14">
          <h2 className="mb-6 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
            Phase indicator (initial builds only)
          </h2>
          <div className="my-3 flex items-center gap-3 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200" />
            <span>Phase 1 of 5 — Planning the structure</span>
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
          <div className="my-3 flex items-center gap-3 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200" />
            <span>Phase 2 of 5 — Adding habits</span>
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
          <div className="my-3 flex items-center gap-3 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200" />
            <span>Phase 5 of 5 — Final polish</span>
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
        </section>

        {/* ── useBuildChatV2 — reducer state inspector ── BEO-808 */}
        <ReducerInspector />

        {/* ── Shimmer variants ── */}
        <section id="shimmer" className="mt-14 pb-20">
          <h2 className="mb-6 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
            Shimmer animation variants
          </h2>

          {/* Inline keyframes for the two non-standard variants */}
          <style>{`
            @keyframes shimmer-slow {
              0%   { background-position: -200% center; }
              100% { background-position:  200% center; }
            }
            .shimmer-slow {
              background: linear-gradient(90deg, #6b7280 20%, #9ca3af 50%, #6b7280 80%);
              background-size: 200% auto;
              -webkit-background-clip: text;
              background-clip: text;
              -webkit-text-fill-color: transparent;
              animation: shimmer-slow 3s linear infinite;
            }

            @keyframes shimmer-contrast {
              0%   { background-position: -200% center; }
              100% { background-position:  200% center; }
            }
            .shimmer-contrast {
              background: linear-gradient(90deg, #374151 20%, #9ca3af 50%, #374151 80%);
              background-size: 200% auto;
              -webkit-background-clip: text;
              background-clip: text;
              -webkit-text-fill-color: transparent;
              animation: shimmer-contrast 2s linear infinite;
            }
          `}</style>

          <div className="flex flex-row gap-8">
            {/* Current */}
            <div>
              <p className="mb-2 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                Current · 2s linear
              </p>
              <span
                className="live-status-shimmer inline-block text-[14px] leading-[1.55] tracking-[-0.01em]"
                style={{ width: 200, height: 16, display: "block" }}
              >
                Working…
              </span>
            </div>

            {/* Slower */}
            <div>
              <p className="mb-2 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                Slower · 3s linear
              </p>
              <span
                className="shimmer-slow inline-block text-[14px] leading-[1.55] tracking-[-0.01em]"
                style={{ width: 200, height: 16, display: "block" }}
              >
                Working…
              </span>
            </div>

            {/* Higher contrast */}
            <div>
              <p className="mb-2 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
                Higher contrast · 2s · zinc-400 highlight
              </p>
              <span
                className="shimmer-contrast inline-block text-[14px] leading-[1.55] tracking-[-0.01em]"
                style={{ width: 200, height: 16, display: "block" }}
              >
                Working…
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
