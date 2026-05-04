/**
 * ChatPanelV2 — BEO-810 / Sprint 9 Phase 3.2
 *
 * Shell component that owns useBuildChatV2 and renders the v2 chat UI tree.
 * Operates behind the USE_CHAT_PANEL_V2 feature flag.
 * NOT wired into the live builder — dev preview only until Phase 4 wiring.
 *
 * Sub-components (MessageList, Composer) are co-located in this file since
 * they are specific to this shell and have no other consumers.
 */
import { useState } from "react";
import { useBuildChatV2, type Message } from "../../../hooks/useBuildChatV2";
import { LiveStatusPill } from "../LiveStatusPill";
import { InlineConfirmation } from "./InlineConfirmation";

// ─── MessageList ──────────────────────────────────────────────────────────────

function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((m) => (
        <div key={m.id} className="text-[14px] leading-[1.55] tracking-[-0.01em]">
          <span className="font-medium">{m.role === "user" ? "You" : "B"}:</span>{" "}
          <span className={m.streaming ? "opacity-70" : ""}>{m.content || `[${m.type}]`}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function Composer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (p: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="border-t border-zinc-200 px-4 py-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-zinc-200 px-3 py-2 text-[14px] leading-[1.55] tracking-[-0.01em] outline-none focus:border-zinc-400 disabled:opacity-50"
          disabled={disabled}
          placeholder={disabled ? "Building…" : "Message…"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && value.trim()) {
              onSubmit(value.trim());
              setValue("");
            }
          }}
        />
        <button
          disabled={disabled || !value.trim()}
          className="rounded-md bg-zinc-900 px-3 py-2 text-[11px] font-medium text-white disabled:opacity-40"
          onClick={() => {
            if (value.trim()) {
              onSubmit(value.trim());
              setValue("");
            }
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── ChatPanelV2 ──────────────────────────────────────────────────────────────

const ACTIVE_PHASES = ["classifying", "thinking", "planning", "building", "persisting", "summarizing"] as const;
const COMPOSER_DISABLED_PHASES = ["building", "persisting"] as const;

export function ChatPanelV2({ projectId }: { projectId: string }) {
  const { state, sendMessage, implementPlan } = useBuildChatV2(projectId);

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={state.messages} />

      {(ACTIVE_PHASES as readonly string[]).includes(state.phase) && (
        <div className="px-4 py-1">
          <LiveStatusPill currentAction={state.currentAction?.label ?? null} />
        </div>
      )}

      {state.phase === "awaiting_implement" && state.pendingPlan && (
        <div className="px-4 py-2">
          <InlineConfirmation
            summary={state.pendingPlan.summary}
            cta={state.pendingPlan.cta}
            confidence={0.9}
            onImplement={() => implementPlan(state.pendingPlan!.cta.planId)}
            onCancel={() => {}}
          />
        </div>
      )}

      <Composer
        disabled={(COMPOSER_DISABLED_PHASES as readonly string[]).includes(state.phase)}
        onSubmit={(prompt) => { void sendMessage(prompt); }}
      />
    </div>
  );
}
