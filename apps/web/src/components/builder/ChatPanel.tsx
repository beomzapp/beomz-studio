/**
 * ChatPanel — BEO-364 clean rewrite.
 *
 * Accepts ChatMessage[] directly from @beomz-studio/contracts (no legacy adapter).
 * Message rendering delegated to ChatMessageView (ChatMessage.tsx).
 * Input bar kept exactly as before.
 */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { ArrowDown, ListChecks, Paperclip, Send, Sparkles, Square } from "lucide-react";
import { cn } from "../../lib/cn";
import { BuildingShimmer, ChatMessageView } from "./ChatMessage";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  messages: ChatMessage[];
  isBuilding: boolean;
  onSendMessage: (text: string) => void;
  onStopStreaming?: () => void;
  onRetry?: () => void;
  width?: number;
  suggestionChips?: string[];
  onDismissChips?: () => void;
  /** Current credits balance — 0 disables send */
  creditsBalance?: number;
  /** PhasePlanCard rendered after messages when phaseMode is active */
  phaseCard?: ReactNode;
  /** FeatureScopeCard rendered after messages during scope confirmation */
  scopeCard?: ReactNode;
  /** InsufficientCreditsCard rendered after messages when credits are low */
  insufficientCreditsCard?: ReactNode;
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export function ChatPanel({
  messages,
  isBuilding,
  onSendMessage,
  onStopStreaming,
  onRetry,
  width = 380,
  suggestionChips,
  onDismissChips,
  creditsBalance,
  phaseCard,
  scopeCard,
  insufficientCreditsCard,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const outOfCredits = typeof creditsBalance === "number" && creditsBalance <= 0;
  const [chipsDismissed, setChipsDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const userScrolledUp = useRef(false);

  // Reset chipsDismissed when new chips arrive
  const prevChipsRef = useRef(suggestionChips);
  useEffect(() => {
    if (suggestionChips && suggestionChips.length > 0 && suggestionChips !== prevChipsRef.current) {
      setChipsDismissed(false);
    }
    prevChipsRef.current = suggestionChips;
  }, [suggestionChips]);

  const dismissChips = useCallback(() => {
    setChipsDismissed(true);
    onDismissChips?.();
  }, [onDismissChips]);

  const handleChipClick = useCallback(
    (chip: string) => {
      dismissChips();
      onSendMessage(chip);
    },
    [dismissChips, onSendMessage],
  );

  const showChips =
    !chipsDismissed && !isBuilding && suggestionChips && suggestionChips.length > 0;

  // Auto-scroll to bottom when messages change, unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isBuilding]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distFromBottom > 80;
    setShowScrollBtn(distFromBottom > 80);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    userScrolledUp.current = false;
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isBuilding) return;
    onSendMessage(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isBuilding, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      if (e.target.value.length > 0 && showChips) dismissChips();
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    [showChips, dismissChips],
  );

  const hasMessages = messages.length > 0;
  // Show pending shimmer when building hasn't emitted a building message yet
  const hasBuildingMessage = messages.some(m => m.type === "building");
  const showPendingShimmer = isBuilding && !hasBuildingMessage;

  return (
    <div
      className="flex h-full shrink-0 flex-col border-r border-[#e5e5e5] bg-[#faf9f6]"
      style={{ width }}
    >
      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
      >
        {!hasMessages && !isBuilding && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[200px] text-center text-sm leading-relaxed text-[#c4c4c4]">
              Describe what you want to build or change
            </p>
          </div>
        )}

        {(hasMessages || isBuilding) && (
          <div className="min-w-0 space-y-4">
            {messages.map(msg => (
              <div key={msg.id}>
                <ChatMessageView message={msg} onRetry={onRetry} />
              </div>
            ))}

            {/* Pending shimmer — covers the gap before first building message arrives */}
            {showPendingShimmer && <BuildingShimmer />}

            {/* Cards positioned at bottom of message list */}
            {insufficientCreditsCard}
            {scopeCard}
            {phaseCard}
          </div>
        )}

        <div ref={chatEndRef} />

        {/* Scroll to bottom FAB */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[#e5e5e5] bg-white p-2 shadow-md transition-colors hover:bg-[rgba(0,0,0,0.02)]"
          >
            <ArrowDown size={14} className="text-[#6b7280]" />
          </button>
        )}
      </div>

      {/* Suggestion chips above input */}
      {showChips && (
        <div className="flex flex-shrink-0 flex-wrap gap-2 px-3 pb-2">
          {suggestionChips!.map(chip => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="rounded-full border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs text-[#6b7280] transition-all hover:border-[#d1d5db] hover:text-[#374151]"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input bar — DO NOT CHANGE */}
      <div className="flex-shrink-0 border-t border-[#e5e5e5] px-3 py-2">
        <div className="rounded-xl border border-[#e5e5e5] bg-white focus-within:border-[#F97316]/50">
          <div className="px-3 pt-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask Beomz to build or change..."
              rows={1}
              className="max-h-[120px] w-full resize-none bg-transparent text-sm text-[#1a1a1a] outline-none placeholder:text-[#9ca3af]"
            />
          </div>

          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-0.5">
              <button
                className="rounded p-1.5 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]"
                title="Attach file"
              >
                <Paperclip size={15} />
              </button>
              <button
                className="rounded p-1.5 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]"
                title="Enhance with AI"
              >
                <Sparkles size={15} />
              </button>
              <button
                onClick={() => setPlanMode(v => !v)}
                className={cn(
                  "rounded p-1.5 transition-colors",
                  planMode
                    ? "bg-[#F97316]/10 text-[#F97316]"
                    : "text-[#9ca3af] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]",
                )}
                title="Plan mode"
              >
                <ListChecks size={15} />
              </button>
            </div>

            {isBuilding ? (
              <button
                onClick={onStopStreaming}
                className="rounded-lg bg-[#1a1a1a] p-1.5 text-white transition-colors hover:bg-[#333]"
                title="Stop generating"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || outOfCredits}
                className="rounded-lg bg-[#F97316] p-1.5 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
                title={outOfCredits ? "Out of credits — upgrade to continue" : "Send"}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
