/**
 * V2ComponentsPage — BEO-804 / BEO-805
 *
 * DEV-ONLY preview route for v2 chat-panel components.
 * Accessible at /dev/v2-components in development builds, or in production
 * when localStorage "beomz:devMode" === "true" (BEO-805 gate).
 */
import { useState } from "react";
import { InlineConfirmation } from "../../../components/builder/v2";
import { LiveStatusPill } from "../../../components/builder/LiveStatusPill";

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
      {/* Sticky section nav — BEO-805 */}
      <nav className="sticky top-0 z-10 mb-4 flex gap-3 border-b border-zinc-200 bg-white/95 px-4 py-2 text-[12px] leading-[1.4] tracking-[-0.005em] backdrop-blur">
        <a href="#inline-confirmation">InlineConfirmation</a>
        <a href="#live-status-pill">LiveStatusPill</a>
        <a href="#phase-indicator">Phase indicator</a>
        <a href="#shimmer">Shimmer variants</a>
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
