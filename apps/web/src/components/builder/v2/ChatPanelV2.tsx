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

// ─── TextMessage ────────────────────────────────────────────────────────────

export function TextMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[75%] rounded-xl bg-zinc-100 px-3 py-2 text-[14px] leading-[1.55] tracking-[-0.01em] whitespace-pre-wrap"
            : "max-w-[85%] text-[14px] leading-[1.55] tracking-[-0.01em] whitespace-pre-wrap"
        }
      >
        {!isUser && <span className="font-medium">B: </span>}
        {message.content}
        {message.streaming && <span className="blinking-cursor">|</span>}
      </div>
    </div>
  );
}

// ─── BuildSummary ────────────────────────────────────────────────────────────

export function BuildSummary({ message }: { message: Message }) {
  const files = message.filesChanged ?? [];
  const seconds = Math.round((message.durationMs ?? 0) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isStreaming = message.streaming || files.length === 0;

  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-[13px]">
      {isStreaming ? (
        <span className="live-status-shimmer">Building…</span>
      ) : (
        <>
          <span>✓ Built {files.length} {files.length === 1 ? "file" : "files"} · {mins > 0 ? `${mins}m ` : ""}{secs}s · {message.creditsUsed ?? 0} credits</span>
          {(message.nextSteps ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(message.nextSteps ?? []).map((step) => (
                <button
                  key={step.prompt}
                  className="bg-white border border-zinc-200 rounded-full px-3 py-1 text-[12px] hover:bg-zinc-50 cursor-pointer"
                  onClick={() => {}}
                >
                  {step.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── InlineError ─────────────────────────────────────────────────────────────

export function InlineError({ message, onRetry }: { message: Message; onRetry: () => void }) {
  return (
    <div className="flex items-start justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[13px] text-red-700">
      <span>{message.content}</span>
      {message.retryable && (
        <button
          className="ml-3 shrink-0 text-[12px] font-medium text-red-600 hover:text-red-800"
          onClick={onRetry}
        >
          ↺ Retry
        </button>
      )}
    </div>
  );
}

// ─── MessageList ──────────────────────────────────────────────────────────────

function MessageList({ messages, retry }: { messages: Message[]; retry: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((m) => {
        if (m.type === "build_summary") return <BuildSummary key={m.id} message={m} />;
        if (m.type === "error") return <InlineError key={m.id} message={m} onRetry={retry} />;
        return <TextMessage key={m.id} message={m} />;
      })}
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
  const { state, sendMessage, implementPlan, retry } = useBuildChatV2(projectId);

  return (
    <div className="flex h-full flex-col">
      <MessageList messages={state.messages} retry={retry} />

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
