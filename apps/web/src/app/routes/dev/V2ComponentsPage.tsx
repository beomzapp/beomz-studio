/**
 * V2ComponentsPage — BEO-804
 *
 * DEV-ONLY preview route for v2 chat-panel components.
 * Accessible at /dev/v2-components in development builds only.
 * This module is excluded from production bundles via the
 * `import.meta.env.DEV` guard in router.ts.
 */
import { useState } from "react";
import { InlineConfirmation } from "../../../components/builder/v2";

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

export function V2ComponentsPage() {
  // "Reset all" — incrementing this resets every card key
  const [globalReset, setGlobalReset] = useState(0);
  // Per-card keys — incrementing remounts just that card
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
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-[14px] font-semibold leading-tight tracking-[-0.015em] text-[#111]">
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

        {/* Cards */}
        <div className="flex flex-col gap-8">
          {CARDS.map((card, idx) => (
            <section key={idx}>
              {/* State label */}
              <p className="mb-2 text-[11px] font-medium leading-[1.4] tracking-[-0.005em] text-zinc-400 uppercase">
                {card.label}
              </p>

              {/* Component under test */}
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
      </div>
    </div>
  );
}
