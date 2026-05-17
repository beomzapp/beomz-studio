/**
 * V2ComponentsPage — BEO-804 / BEO-805 / BEO-808 / BEO-825
 *
 * DEV-ONLY preview route for v2 chat-panel components + marketing shell.
 * Accessible at /dev/v2-components in development builds, or in production
 * when localStorage "beomz:devMode" === "true" (BEO-805 gate).
 */
import { useReducer, useState, useEffect, useRef } from "react";
import { ListChecks, Sparkles, Paperclip, Mic, SlidersHorizontal, Palette, Loader2 } from "lucide-react";
import { cn } from "../../../lib/cn";
import { MarketingNav } from "../../../components/marketing/MarketingNav";
import { FinalCtaBanner } from "../../../components/marketing/FinalCtaBanner";
import { MarketingFooter } from "../../../components/marketing/MarketingFooter";
import {
  EXAMPLE_BUILD_COMPLETE,
  EXAMPLE_TURN_COMPLETE,
  EXAMPLE_TURN_STARTED,
} from "@beomz-studio/contracts";
import { ChatPanelV2, InlineConfirmation, TextMessage, BuildSummary, InlineError } from "../../../components/builder/v2";
import { LiveStatusPill } from "../../../components/builder/LiveStatusPill";
import { chatV2Reducer, initialChatState, type Message } from "../../../hooks/useBuildChatV2";
import { ChatStateInspectorV2 } from "../../../components/dev/ChatStateInspectorV2";
import type { ChatState } from "../../../hooks/useBuildChatV2";

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

// ─── BEO-813: Chat inspector v2 fake state ───────────────────────────────────

const fakeInspectorState: ChatState = {
  turnId: "abc12345-0000-0000-0000-000000000000",
  phase: "building",
  messages: [
    {
      id: "m1",
      turnId: "t1",
      role: "user",
      type: "text",
      content: "Make the hero section taller",
      streaming: false,
      createdAt: Date.now() - 10000,
    },
    {
      id: "m2",
      turnId: "t1",
      role: "assistant",
      type: "text",
      content: "I'll increase the hero section height from h-96 to h-[480px] and adjust the inner padding.",
      streaming: true,
      createdAt: Date.now() - 5000,
    },
  ],
  currentAction: { type: "tool_action", label: "Editing src/App.tsx" } as any,
  pendingPlan: null,
  error: null,
};

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

// ─── BEO-823: Landing toolbar glass pill ─────────────────────────────────────

const GLASS_PILL = "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all hover:bg-white/[0.08] hover:border-white/20";

function DarkStage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-[#131313] p-6 flex items-start", className)}>
      {children}
    </div>
  );
}

function OptionsPopover({ architecture, setArchitecture }: { architecture: "single" | "multi"; setArchitecture: (v: "single" | "multi") => void }) {
  return (
    <div className="mt-2 w-[380px] rounded-2xl border border-white/10 bg-[#0a0a0a]/90 p-5 shadow-2xl backdrop-blur-xl">
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">Architecture</p>
        <div className="flex flex-col gap-2">
          <button
            onMouseDown={(e) => { e.preventDefault(); setArchitecture("single"); }}
            className={cn("rounded-xl border p-3 text-left transition-all", architecture === "single" ? "border-[#00D5D8]/40 bg-[#00D5D8]/10" : "border-white/10 bg-white/5")}
          >
            <p className="text-sm font-medium text-white/90">Single Architecture</p>
            <p className="mt-0.5 text-xs text-white/50">Next.js + Supabase · Vercel-deployable</p>
          </button>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 opacity-50">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white/90">Multi Architecture</p>
              <span className="rounded-full bg-[#00D5D8]/20 px-2 py-0.5 text-[10px] font-medium text-[#00D5D8]">Pro</span>
            </div>
            <p className="mt-0.5 text-xs text-white/50">Custom stacks · Python, Go, Rust &amp; more</p>
            <a href="#" className="mt-1.5 inline-block text-xs text-[#00D5D8] underline">Upgrade to Pro to unlock</a>
          </div>
        </div>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">Technology Stack</p>
        <div className="flex gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">Next.js <span className="text-white/30">(required)</span></div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">Supabase <span className="text-white/30">(built-in)</span></div>
        </div>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">Design DNA</p>
        <button onMouseDown={(e) => e.preventDefault()} className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:bg-white/[0.08]">
          <Palette size={20} className="text-[#00D5D8]" />
        </button>
      </div>
    </div>
  );
}

function LandingToolbarSection() {
  const [arch, setArch] = useState<"single" | "multi">("single");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!optionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (optionsRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOptionsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [optionsOpen]);

  useEffect(() => {
    if (!optionsOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOptionsOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [optionsOpen]);

  return (
    <section id="landing-toolbar" className="mt-14 pb-8">
      <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
        Landing toolbar — glassmorphic
      </h2>
      <p className="mb-6 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
        BEO-823 · 6 sample states · Plan / Enhance / Paperclip / Voice (Pro-gated) / Options popover
      </p>

      <div className="flex flex-col gap-6">
        {/* State 1 — Voice button idle */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
            1 · Voice button — idle
          </p>
          <DarkStage>
            <div className="relative group">
              <button
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Voice chat (Pro feature)"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all text-white/30 cursor-not-allowed"
              >
                <Mic size={14} />
              </button>
            </div>
          </DarkStage>
        </div>

        {/* State 2 — Voice button hover (tooltip forced visible) */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
            2 · Voice button — hover (tooltip visible)
          </p>
          <DarkStage className="pt-12">
            <div className="relative">
              <button
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Voice chat (Pro feature)"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all text-white/30 cursor-not-allowed"
              >
                <Mic size={14} />
              </button>
              <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1a1a]/95 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md pointer-events-none">
                Voice chat is available on Pro and above
              </div>
            </div>
          </DarkStage>
        </div>

        {/* State 3 — Options button closed */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
            3 · Options button — closed
          </p>
          <DarkStage>
            <button
              onMouseDown={(e) => e.preventDefault()}
              className={cn(GLASS_PILL, "text-white/60")}
            >
              <SlidersHorizontal size={14} />
              Options · Next.js / Supabase
            </button>
          </DarkStage>
        </div>

        {/* State 4 — Options button open (popover, single selected) */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
            4 · Options button — open (single architecture selected)
          </p>
          <DarkStage className="flex-col">
            <button
              ref={triggerRef}
              onMouseDown={(e) => { e.preventDefault(); setOptionsOpen(o => !o); }}
              className={cn(GLASS_PILL, "bg-white/[0.08] border-white/20 text-white/80")}
            >
              <SlidersHorizontal size={14} />
              Options · Next.js / Supabase
            </button>
            <div ref={optionsRef}>
              <OptionsPopover architecture={arch} setArchitecture={setArch} />
            </div>
          </DarkStage>
        </div>

        {/* State 5 — Popover Multi architecture row highlighted */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
            5 · Options popover — Multi architecture disabled state
          </p>
          <DarkStage>
            <div className="w-[380px] rounded-2xl border border-white/10 bg-[#0a0a0a]/90 p-5 shadow-2xl backdrop-blur-xl">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">Architecture</p>
              <div className="flex flex-col gap-2">
                <button className="rounded-xl border border-white/10 bg-white/5 p-3 text-left">
                  <p className="text-sm font-medium text-white/90">Single Architecture</p>
                  <p className="mt-0.5 text-xs text-white/50">Next.js + Supabase · Vercel-deployable</p>
                </button>
                <div className="rounded-xl border border-white/20 bg-white/[0.07] p-3 ring-1 ring-white/10">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white/90">Multi Architecture</p>
                    <span className="rounded-full bg-[#00D5D8]/20 px-2 py-0.5 text-[10px] font-medium text-[#00D5D8]">Pro</span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/50">Custom stacks · Python, Go, Rust &amp; more</p>
                  <a href="#" className="mt-1.5 inline-block text-xs text-[#00D5D8] underline">Upgrade to Pro to unlock</a>
                  <p className="mt-1 text-[10px] text-white/30">Disabled — not available on current plan</p>
                </div>
              </div>
            </div>
          </DarkStage>
        </div>

        {/* State 6 — Full toolbar, all 5 buttons */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
            6 · Full toolbar — all 5 buttons
          </p>
          <DarkStage>
            <div className="flex items-center gap-3">
              <button onMouseDown={(e) => e.preventDefault()} className={cn(GLASS_PILL, "text-white/40")}>
                <ListChecks size={14} />
                Plan
              </button>
              <button onMouseDown={(e) => e.preventDefault()} className={cn(GLASS_PILL, "text-white/40")}>
                <Sparkles size={14} />
                Enhance
              </button>
              <button onMouseDown={(e) => e.preventDefault()} className={cn(GLASS_PILL, "text-white/40")}>
                <Paperclip size={14} />
              </button>
              <div className="relative group">
                <button onMouseDown={(e) => e.preventDefault()} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all text-white/30 cursor-not-allowed">
                  <Mic size={14} />
                </button>
                <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1a1a]/95 px-3 py-1.5 text-xs text-white opacity-0 shadow-xl backdrop-blur-md transition-opacity group-hover:opacity-100 pointer-events-none">
                  Voice chat is available on Pro and above
                </div>
              </div>
              <button onMouseDown={(e) => e.preventDefault()} className={cn(GLASS_PILL, "text-white/60")}>
                <SlidersHorizontal size={14} />
                Options · Next.js / Supabase
              </button>
            </div>
          </DarkStage>
        </div>
      </div>

      {/* Note: Loader2 imported for completeness but not shown in static states */}
      <span className="hidden"><Loader2 size={14} /></span>
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
        <a href="#chat-panel-v2">ChatPanelV2</a>
        <a href="#message-types">Message types</a>
        <a href="#chat-state-inspector-v2">Chat inspector v2</a>
        <a href="#phase4-wiring">Phase 4 wiring</a>
        <a href="#landing-toolbar">Landing toolbar</a>
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

        {/* ── ChatPanelV2 — shell ── BEO-810 */}
        <section id="chat-panel-v2" className="mt-14">
          <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
            ChatPanelV2 — shell
          </h2>
          <p className="mb-4 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
            BEO-810 · Phase 3.2 — shell component wiring useBuildChatV2
          </p>
          <div className="h-[480px] rounded-xl border border-zinc-200 overflow-hidden">
            <ChatPanelV2 projectId="dev-preview-001" userAvatarUrl={undefined} userInitials="OA" />
          </div>
          <p className="mt-2 text-[12px] text-zinc-500">
            Composer sends to POST /api/builds/v2/message — works when USE_CHAT_PANEL_V2=true on API.
          </p>
        </section>

        {/* ── Shimmer variants ── */}
        <section id="shimmer" className="mt-14">
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

        {/* ── Message types ── BEO-812 */}
        <section id="message-types" className="mt-14">
          <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
            Message types
          </h2>
          <p className="mb-6 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
            BEO-812 · TextMessage, BuildSummary, InlineError — 8 sample states
          </p>
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                TextMessage — user bubble short
              </p>
              <TextMessage
                message={{ id: "m1", turnId: "t1", role: "user", type: "text", content: "Make the hero section taller", streaming: false, createdAt: 0 } as Message}
                userAvatarUrl={undefined}
                userInitials="OA"
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                TextMessage — user bubble long
              </p>
              <TextMessage
                message={{ id: "m2", turnId: "t1", role: "user", type: "text", content: "Can you redesign the pricing section? I want three tiers: Starter, Pro, and Enterprise. Make it look modern with a highlighted middle card. The card should have a gradient border.", streaming: false, createdAt: 0 } as Message}
                userAvatarUrl={undefined}
                userInitials="OA"
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                TextMessage — assistant (not streaming)
              </p>
              <TextMessage
                message={{ id: "m3", turnId: "t1", role: "assistant", type: "text", content: "I'll increase the hero section height from h-96 to h-[480px] and adjust the inner padding to match.", streaming: false, createdAt: 0 } as Message}
                userAvatarUrl={undefined}
                userInitials="OA"
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                TextMessage — assistant streaming (blinking cursor)
              </p>
              <TextMessage
                message={{ id: "m4", turnId: "t1", role: "assistant", type: "text", content: "I'll redesign the pricing section with three tiers", streaming: true, createdAt: 0 } as Message}
                userAvatarUrl={undefined}
                userInitials="OA"
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                BuildSummary — with files + nextSteps
              </p>
              <BuildSummary
                message={{ id: "m5", turnId: "t1", role: "assistant", type: "build_summary", content: "", streaming: false, filesChanged: ["src/App.tsx", "src/styles.css"], durationMs: 42000, creditsUsed: 3, nextSteps: [{ label: "Add dark mode", prompt: "add dark mode" }, { label: "Improve mobile layout", prompt: "improve mobile layout" }], createdAt: 0 } as Message}
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                BuildSummary — streaming / empty (shimmer)
              </p>
              <BuildSummary
                message={{ id: "m6", turnId: "t2", role: "assistant", type: "build_summary", content: "", streaming: true, filesChanged: [], creditsUsed: 0, createdAt: 0 } as Message}
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                InlineError — not retryable
              </p>
              <InlineError
                message={{ id: "m7", turnId: "t2", role: "assistant", type: "error", content: "Build failed: could not resolve import './missing-module'", retryable: false, streaming: false, createdAt: 0 } as Message}
                onRetry={() => console.log("retry clicked")}
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
                InlineError — retryable (shows Retry button)
              </p>
              <InlineError
                message={{ id: "m8", turnId: "t2", role: "assistant", type: "error", content: "Connection lost — your changes were not saved.", retryable: true, streaming: false, createdAt: 0 } as Message}
                onRetry={() => console.log("retry clicked")}
              />
            </div>
          </div>
        </section>

        {/* ── ChatStateInspectorV2 ── BEO-813 */}
        <section id="chat-state-inspector-v2" className="space-y-4 mt-14">
          <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
            Chat inspector v2
          </h2>
          <p className="mb-4 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
            BEO-813 · phase: building · 2 msgs · inspector is position:fixed — floats over page in real use
          </p>
          <div className="relative h-[380px] border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
            <span className="absolute top-2 left-3 text-[11px] text-zinc-400 font-mono z-10">
              Inspector preview — force-opened, fake state · renders fixed over page
            </span>
            <ChatStateInspectorV2
              projectId="dev-preview-001"
              state={fakeInspectorState}
              forceOpen
            />
          </div>
        </section>
        {/* ── Marketing shell — BEO-825 ── */}
        <MarketingShellSection />

        {/* ── Landing toolbar — BEO-823 ── */}
        <LandingToolbarSection />

        {/* ── Phase 4 — Live wiring (chatV2Enabled flag) ── BEO-815 */}
        {isDevPreviewEnabled() && (
          <section id="phase4-wiring" className="mt-14 pb-32">
            <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
              Phase 4 — Live wiring (chatV2Enabled flag)
            </h2>
            <p className="mb-2 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
              BEO-815 · <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">chatV2Enabled</code> is set to{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">true</code> in{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">ProjectPage</code> when the hydration
              response includes{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">status.features.chatV2 === true</code>.
              When set, <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">&lt;ChatPanelV2&gt;</code> is
              mounted in place of v1 <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">&lt;ChatPanel&gt;</code>.
              No visual change for orgs not in the pilot.
            </p>
            <div className="mb-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
              <pre className="font-mono text-[11px] leading-[1.6] text-zinc-700 whitespace-pre-wrap">{`// BuildStatusResponse (api.ts)
features?: { chatV2?: boolean };

// ProjectPage.tsx hydration
if (status.features?.chatV2) setChatV2Enabled(true);

// ProjectPage.tsx render
{chatV2Enabled
  ? <ChatPanelV2 projectId={projectId ?? ""} />
  : <ChatPanel ...v1props />
}`}</pre>
            </div>
            <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[-0.005em] text-zinc-400">
              Live sample — ChatPanelV2 (projectId="dev-preview-001")
            </p>
            <div className="h-[480px] rounded-xl border border-zinc-200 overflow-hidden">
              <ChatPanelV2 projectId="dev-preview-001" userAvatarUrl={undefined} userInitials="OA" />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── BEO-825: Marketing shell dev-preview ──────────────────────────────────────

function MarketingShellSection() {
  return (
    <section id="marketing-shell" className="mt-14 space-y-10">
      <div>
        <h2 className="mb-1 text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
          Marketing shell
        </h2>
        <p className="mb-6 text-[12px] leading-[1.4] tracking-[-0.005em] text-zinc-500">
          BEO-825 · 5 sample states — MarketingNav (closed · Features open · Solutions open) · FinalCtaBanner · MarketingFooter
        </p>
      </div>

      {/* Sample 1: MarketingNav — default closed state */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[0.05em] text-zinc-400">
          1 · MarketingNav — default closed
        </p>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-[#131313]" style={{ minHeight: 80 }}>
          <MarketingNav
            onSignInClick={() => console.log("[dev] sign in clicked")}
            onGetStartedClick={() => console.log("[dev] get started clicked")}
          />
        </div>
      </div>

      {/* Sample 2: MarketingNav — Features mega open */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[0.05em] text-zinc-400">
          2 · MarketingNav — Features mega open
        </p>
        <div
          className="overflow-hidden rounded-xl border border-zinc-200 bg-[#131313]"
          style={{ minHeight: 480, position: "relative" }}
        >
          <MarketingNav
            forceOpen="features"
            onSignInClick={() => console.log("[dev] sign in clicked")}
            onGetStartedClick={() => console.log("[dev] get started clicked")}
          />
        </div>
      </div>

      {/* Sample 3: MarketingNav — Solutions mega open */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[0.05em] text-zinc-400">
          3 · MarketingNav — Solutions mega open
        </p>
        <div
          className="overflow-hidden rounded-xl border border-zinc-200 bg-[#131313]"
          style={{ minHeight: 420, position: "relative" }}
        >
          <MarketingNav
            forceOpen="solutions"
            onSignInClick={() => console.log("[dev] sign in clicked")}
            onGetStartedClick={() => console.log("[dev] get started clicked")}
          />
        </div>
      </div>

      {/* Sample 4: FinalCtaBanner — standalone */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[0.05em] text-zinc-400">
          4 · FinalCtaBanner — standalone
        </p>
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <FinalCtaBanner onGetStartedClick={() => console.log("[dev] cta get started")} />
        </div>
      </div>

      {/* Sample 5: MarketingFooter — standalone */}
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase leading-[1.4] tracking-[0.05em] text-zinc-400">
          5 · MarketingFooter — standalone
        </p>
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <MarketingFooter />
        </div>
      </div>
    </section>
  );
}

function isDevPreviewEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("beomz:devMode") === "true";
  } catch {
    return false;
  }
}
