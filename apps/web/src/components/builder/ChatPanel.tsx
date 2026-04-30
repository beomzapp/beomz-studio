/**
 * ChatPanel — orchestrator for the builder chat column.
 *
 * BEO-725 (clean rewrite, replaces the patched ChatPanel.tsx):
 *
 *   Responsibilities:
 *     - Layout: scroll region, suggestion-chip strip, ImplementBar zone,
 *       input bar, image attach.
 *     - Map each message in `messages` to the right component via
 *       ChatMessageView. Filters out in-flight `building` messages while
 *       isBuilding so BuildProgressCard.Shimmer takes over cleanly.
 *     - Capture the message-id snapshot on mount in `initialMsgIdsRef` so
 *       only messages added AFTER mount get TypewriterText animation. Hard
 *       refresh shows everything instantly.
 *     - Render the floating ImplementBar (sticky, between messages and
 *       input). The Implement button on it is the ONLY Implement button on
 *       the page — no chat message component is allowed to render one.
 *
 *   Data-layer: untouched; useBuildChat.ts owns all state and SSE handling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { ArrowDown, MessageSquare, Paperclip, Send, Square, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { uploadImage } from "../../lib/api";
import { BAvatar } from "./Avatars";
import { ChatMessageView } from "./ChatMessage";
import { BuildProgressCard } from "./BuildProgressCard";
import { ImplementBar } from "./ImplementBar";

const DB_CHIP_FILTER = /database|supabase|neon|postgres|persist/i;

// ─── Analysing image card ─────────────────────────────────────────────────────

function AnalysingImageCard() {
  return (
    <div className="flex items-start gap-2 py-1">
      <BAvatar />
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white/80 px-3 py-2">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
          <span className="text-sm text-[#6b7280]">Analysing image…</span>
        </div>
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  messages: ChatMessage[];
  isBuilding: boolean;
  onSendMessage: (text: string, imageUrl?: string) => void;
  onStopStreaming?: () => void;
  /** Hard kill WebContainer + reset all state. */
  onForceStop?: () => void;
  /** True from stop click until isBuilding settles to false. */
  isStopPending?: boolean;
  onRetry?: () => void;
  onReportIssue?: () => void;
  width?: number;
  suggestionChips?: string[];
  onDismissChips?: () => void;
  creditsBalance?: number;
  chatModeActive?: boolean;
  onToggleChatMode?: () => void;
  /** Drives the floating ImplementBar above the input. */
  implementSuggestion?: { summary: string } | null;
  onImplement?: () => void;
  onDismissImplement?: () => void;
  projectId?: string | null;
  /** Forwarded to image_intent confirmation cards. */
  onImplementPlan?: (plan: string, imageUrl?: string) => void;
  isAnalysingImage?: boolean;
  isIterationBuild?: boolean;
  userFirstName?: string;
  userAvatarUrl?: string;
  userInitials?: string;
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function ChatPanel({
  messages,
  isBuilding,
  onSendMessage,
  onStopStreaming,
  onForceStop,
  isStopPending,
  onRetry,
  onReportIssue,
  width = 380,
  suggestionChips,
  onDismissChips,
  creditsBalance,
  chatModeActive = false,
  onToggleChatMode,
  implementSuggestion,
  onImplement,
  onDismissImplement,
  projectId,
  onImplementPlan,
  isAnalysingImage,
  isIterationBuild,
  userFirstName,
  userAvatarUrl,
  userInitials,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const outOfCredits = typeof creditsBalance === "number" && creditsBalance <= 0;
  const [chipsDismissed, setChipsDismissed] = useState(false);

  // BEO-725: snapshot of message IDs present on mount. Only messages added
  // AFTER mount get TypewriterText. Hard refresh → no re-animation.
  const initialMsgIdsRef = useRef<Set<string> | null>(null);
  if (initialMsgIdsRef.current === null) {
    initialMsgIdsRef.current = new Set(messages.map(m => m.id));
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const userScrolledUp = useRef(false);

  // Stop button — turns red on click, force-stop revealed after 2s
  const [stopClicked, setStopClicked] = useState(false);
  const [showForceStop, setShowForceStop] = useState(false);
  const forceStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isBuilding && !isStopPending) {
      setStopClicked(false);
      setShowForceStop(false);
      if (forceStopTimerRef.current) {
        clearTimeout(forceStopTimerRef.current);
        forceStopTimerRef.current = null;
      }
    }
  }, [isBuilding, isStopPending]);

  // ─── Image attach state ───────────────────────────────────────────────────
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imagePreparing, setImagePreparing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = useCallback(
    async (file: File) => {
      setImageError(null);
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError("Image must be under 10MB.");
        return;
      }
      if (!file.type.startsWith("image/")) {
        setImageError("Only image files are supported.");
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      setPendingImageFile(file);
      setPendingImagePreview(objectUrl);
      setPendingImageUrl(null);

      if (!projectId) return;

      setImageUploading(true);
      try {
        const { imageUrl } = await uploadImage(file, projectId);
        setPendingImageUrl(imageUrl);
      } catch {
        setImageError(null);
      } finally {
        setImageUploading(false);
      }
    },
    [projectId],
  );

  const clearPendingImage = useCallback(() => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(null);
    setPendingImagePreview(null);
    setPendingImageUrl(null);
    setImageError(null);
    setImageUploading(false);
    setImagePreparing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingImagePreview]);

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (file && file.type.startsWith("image/")) {
        e.preventDefault();
        void handleImageFile(file);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleImageFile]);

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

  const populateInputWithoutSend = useCallback((text: string) => {
    setInput(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
  }, []);

  const handleSend = useCallback(() => {
    if (isBuilding) return;
    const text = input.trim();
    const hasDeferredImage = Boolean(pendingImageFile && !pendingImageUrl);
    if (!text && !pendingImageUrl && !hasDeferredImage) return;

    const finishSend = (imageUrl?: string) => {
      onSendMessage(text, imageUrl);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      clearPendingImage();
    };

    if (pendingImageUrl) {
      finishSend(pendingImageUrl);
      return;
    }
    if (pendingImageFile) {
      setImagePreparing(true);
      void fileToDataUrl(pendingImageFile)
        .then(dataUrl => finishSend(dataUrl))
        .catch(() => setImageError("Could not read image."))
        .finally(() => setImagePreparing(false));
      return;
    }
    finishSend();
  }, [input, isBuilding, pendingImageUrl, pendingImageFile, onSendMessage, clearPendingImage]);

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
  // While a build is in progress, suppress in-flight `building` messages —
  // BuildProgressCard.Shimmer renders below the message list instead.
  const visibleMessages = isBuilding
    ? messages.filter(m => m.type !== "building")
    : messages;
  const showShimmer = isBuilding;

  const sendDisabled =
    (!input.trim() && !pendingImageUrl && !pendingImageFile)
    || outOfCredits
    || imageUploading
    || imagePreparing;

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
          <div className="min-w-0 space-y-4">
            <div className="flex items-start gap-2 py-1">
              <BAvatar />
              <p className="text-sm leading-relaxed text-[#374151]">
                {userFirstName
                  ? `Hey ${userFirstName}! 👋 Ready to build something awesome? What's the idea?`
                  : "Hey! 👋 Ready to build something awesome? What's the idea?"}
              </p>
            </div>
          </div>
        )}

        {(hasMessages || isBuilding) && (
          <div className="min-w-0 space-y-4">
            {visibleMessages.map(msg => (
              <div key={msg.id}>
                <ChatMessageView
                  message={msg}
                  isBuilding={isBuilding}
                  isNewMessage={!initialMsgIdsRef.current!.has(msg.id)}
                  onRetry={onRetry}
                  onReportIssue={onReportIssue}
                  onPopulateInput={populateInputWithoutSend}
                  onImplementPlan={onImplementPlan}
                  userAvatarUrl={userAvatarUrl}
                  userInitials={userInitials}
                />
              </div>
            ))}

            {/* In-flight build indicator: analysing-image card while we
                wait for image_intent, otherwise the 4-step shimmer. */}
            {isBuilding && isAnalysingImage ? (
              <AnalysingImageCard />
            ) : showShimmer ? (
              <BuildProgressCard.Shimmer isIteration={isIterationBuild} />
            ) : null}
          </div>
        )}

        <div ref={chatEndRef} />

        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[#e5e5e5] bg-white p-2 shadow-md transition-colors hover:bg-[rgba(0,0,0,0.02)]"
          >
            <ArrowDown size={14} className="text-[#6b7280]" />
          </button>
        )}
      </div>

      {/* Suggestion chips — pill style, 11px, 0.5px border, 20px radius */}
      {showChips && (
        <div className="flex flex-shrink-0 flex-wrap gap-1.5 px-3 pb-2">
          {suggestionChips!
            .filter(chip => !DB_CHIP_FILTER.test(chip))
            .map(chip => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                className="rounded-[20px] px-2.5 py-[3px] text-[11px] text-[#9ca3af] transition-all hover:text-[#6b7280]"
                style={{ border: "0.5px solid #e5e5e5" }}
              >
                {chip}
              </button>
            ))}
        </div>
      )}

      {/* Floating ImplementBar — pinned above the input, never scrolls.
          This is the ONLY Implement button on the page. */}
      {implementSuggestion && (
        <ImplementBar
          summary={implementSuggestion.summary}
          onImplement={() => onImplement?.()}
          onDismiss={() => onDismissImplement?.()}
        />
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-[#e5e5e5] px-3 py-2">
        {chatModeActive && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F97316]/10 px-2 py-0.5 text-xs font-medium text-[#F97316]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F97316]" />
              Chat mode
            </span>
            <span className="text-xs text-[#9ca3af]">— thinking it through, no build yet</span>
          </div>
        )}

        {imageError && <p className="mb-1.5 text-xs text-red-500">{imageError}</p>}

        <div
          className={cn(
            "rounded-xl border bg-white focus-within:border-[#F97316]/50",
            chatModeActive ? "border-[#F97316]/30" : "border-[#e5e5e5]",
          )}
        >
          {pendingImagePreview && (
            <div className="flex items-center gap-2 px-3 pt-2">
              <div className="relative inline-flex">
                <img
                  src={pendingImagePreview}
                  alt="Attached"
                  className="h-[60px] max-w-[80px] rounded-lg object-cover"
                />
                {(imageUploading || imagePreparing) && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
                <button
                  onClick={clearPendingImage}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow"
                >
                  <X size={9} />
                </button>
              </div>
            </div>
          )}

          <div className="px-3 pt-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={
                chatModeActive
                  ? "Chat with Beomz…"
                  : !projectId
                    ? "What are we building today?"
                    : "Ask Beomz to build or change..."
              }
              rows={1}
              className="max-h-[120px] w-full resize-none bg-transparent text-sm text-[#1a1a1a] outline-none placeholder:text-[#9ca3af]"
            />
          </div>

          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded p-1.5 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]"
                title="Attach image"
              >
                <Paperclip size={15} />
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleChatMode}
                  aria-pressed={chatModeActive}
                  aria-label={
                    chatModeActive
                      ? "Switch to build mode to create an app"
                      : "Switch to chat mode to brainstorm or research"
                  }
                  title={
                    chatModeActive
                      ? "Switch to build mode to create an app"
                      : "Switch to chat mode to brainstorm or research"
                  }
                  className={cn(
                    "rounded p-1.5 transition-colors",
                    chatModeActive
                      ? "bg-[#F97316]/10 text-[#F97316]"
                      : "text-[#9ca3af] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]",
                  )}
                >
                  <MessageSquare size={15} />
                </button>
                <span
                  className="select-none pr-0.5 text-[11px] font-medium text-[#9ca3af]"
                  aria-hidden
                >
                  {chatModeActive ? "Chat" : "Build"}
                </span>
              </div>
            </div>

            {isBuilding ? (
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => {
                    setStopClicked(true);
                    if (forceStopTimerRef.current) clearTimeout(forceStopTimerRef.current);
                    forceStopTimerRef.current = setTimeout(() => {
                      forceStopTimerRef.current = null;
                      setShowForceStop(true);
                    }, 2000);
                    onStopStreaming?.();
                  }}
                  className={cn(
                    "rounded-lg p-1.5 text-white transition-colors",
                    stopClicked ? "bg-red-500 hover:bg-red-600" : "bg-[#1a1a1a] hover:bg-[#333]",
                  )}
                  title="Stop generating"
                >
                  <Square size={14} />
                </button>
                {showForceStop && (
                  <button
                    onClick={() => {
                      if (forceStopTimerRef.current) {
                        clearTimeout(forceStopTimerRef.current);
                        forceStopTimerRef.current = null;
                      }
                      setStopClicked(false);
                      setShowForceStop(false);
                      onForceStop?.();
                    }}
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-red-500 ring-1 ring-red-500/60 transition-colors hover:bg-red-500 hover:text-white"
                    title="Force stop — kills the preview container"
                  >
                    Force stop
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={sendDisabled}
                className="rounded-lg bg-[#F97316] p-1.5 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
                title={outOfCredits ? "Out of credits — upgrade to continue" : "Send"}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleImageFile(file);
          }}
        />
      </div>
    </div>
  );
}
