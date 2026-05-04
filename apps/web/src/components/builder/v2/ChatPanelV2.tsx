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
import { ChatStateInspectorV2 } from "../../dev/ChatStateInspectorV2";
import { UserAvatar } from "../Avatars";

// ─── TextMessage ────────────────────────────────────────────────────────────

export function TextMessage({
  message,
  userAvatarUrl,
  userInitials,
}: {
  message: Message;
  userAvatarUrl?: string;
  userInitials?: string;
}) {
  const isUser = message.role === "user";
  if (isUser) {
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="max-w-[70%] min-w-0 rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px] border border-[rgba(255,104,0,0.25)] bg-[rgba(255,104,0,0.18)] px-3.5 py-2 text-[14px] leading-[1.55] tracking-[-0.01em] text-[#1a1a1a] break-words whitespace-pre-wrap">
          {message.content}
          {message.streaming && <span className="blinking-cursor">|</span>}
        </div>
        <UserAvatar avatarUrl={userAvatarUrl} initials={userInitials} />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="max-w-[85%] text-[14px] leading-[1.55] tracking-[-0.01em] text-[#374151] whitespace-pre-wrap">
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

function MessageList({
  messages,
  retry,
  userAvatarUrl,
  userInitials,
}: {
  messages: Message[];
  retry: () => void;
  userAvatarUrl?: string;
  userInitials?: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((m) => {
        if (m.type === "build_summary") return <BuildSummary key={m.id} message={m} />;
        if (m.type === "error") return <InlineError key={m.id} message={m} onRetry={retry} />;
        return <TextMessage key={m.id} message={m} userAvatarUrl={userAvatarUrl} userInitials={userInitials} />;
      })}
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function Composer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (p: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex-shrink-0 border-t border-[#e5e5e5] px-3 py-2">
      <div className="rounded-xl border border-[#e5e5e5] bg-white focus-within:border-[#F97316]/50">
        <div className="px-3 pt-2 pb-1">
          <textarea
            className="max-h-[120px] w-full resize-none bg-transparent text-[14px] text-[#1a1a1a] outline-none placeholder:text-[#9ca3af] leading-[1.55]"
            disabled={disabled}
            placeholder={disabled ? "Building…" : "Message…"}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && value.trim()) {
                onSubmit(value.trim());
                setValue("");
              }
            }}
          />
        </div>
        <div className="flex items-center justify-end px-2 pb-1.5">
          <button
            disabled={disabled || !value.trim()}
            className="rounded-lg bg-[#F97316] p-1.5 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
            onClick={() => { if (value.trim()) { onSubmit(value.trim()); setValue(""); } }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ChatPanelV2 ──────────────────────────────────────────────────────────────

const ACTIVE_PHASES = ["classifying", "thinking", "planning", "building", "persisting", "summarizing"] as const;
const COMPOSER_DISABLED_PHASES = ["building", "persisting"] as const;

export function ChatPanelV2({ projectId, userAvatarUrl, userInitials }: { projectId: string; userAvatarUrl?: string; userInitials?: string }) {
  const { state, sendMessage, implementPlan, retry } = useBuildChatV2(projectId);

  return (
    <>
      <div className="flex h-full flex-col bg-[#faf9f6]">
        <MessageList messages={state.messages} retry={retry} userAvatarUrl={userAvatarUrl} userInitials={userInitials} />

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
      <ChatStateInspectorV2 projectId={projectId} state={state} />
    </>
  );
}
