/**
 * ChatPanel — BEO-364 clean rewrite.
 * BEO-398: ImplementBar sticky zone (replaces implement_card message).
 * BEO-182: Image upload — paperclip, paste, thumbnail strip, upload-image API.
 * BEO-511: Prompt enhance (sparkle) removed from builder input — home prompt unchanged.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { ArrowDown, MessageSquare, Paperclip, Send, Square, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { BuildingShimmer, BAvatar, ChatMessageView } from "./ChatMessage";
import { ImplementBar } from "./ImplementBar";
import { uploadImage } from "../../lib/api";

// ─── Analysing image indicator (BEO-462) ──────────────────────────────────────

function AnalysingImageCard() {
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900">
        <span className="text-[9px] font-bold leading-none text-[#F97316]">B</span>
      </div>
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
  /** BEO-587: hard kill WebContainer + reset all state */
  onForceStop?: () => void;
  /** BEO-587: true from stop click until isBuilding settles to false */
  isStopPending?: boolean;
  onRetry?: () => void;
  width?: number;
  suggestionChips?: string[];
  onDismissChips?: () => void;
  /** Current credits balance — 0 disables send */
  creditsBalance?: number;
  /** BEO-396: Chat mode active state */
  chatModeActive?: boolean;
  /** BEO-396: Toggle chat mode on/off */
  onToggleChatMode?: () => void;
  /** BEO-398: Sticky implement zone state */
  implementSuggestion?: { summary: string } | null;
  /** BEO-398: Fires when user clicks "Implement this" */
  onImplement?: () => void;
  /** BEO-398: Fires when user clicks ✕ on the implement zone */
  onDismissImplement?: () => void;
  /** BEO-460: When set, uploads go to POST /builds/upload-image; otherwise image is sent on submit (data URL). */
  projectId?: string | null;
  /** BEO-461/462: Fires build with the given plan string and optional imageUrl. */
  onImplementPlan?: (plan: string, imageUrl?: string) => void;
  /** BEO-462: true while the API is analysing a pasted image — shows subtle loading indicator. */
  isAnalysingImage?: boolean;
  /** BEO-496: true when the current build was detected as an iteration (short preamble). */
  isIterationBuild?: boolean;
  /** BEO-484: user's first name for greeting personalisation */
  userFirstName?: string;
  /** BEO-484: user avatar URL (proxied if needed) */
  userAvatarUrl?: string;
  /** BEO-484: user initials fallback for avatar */
  userInitials?: string;
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export function ChatPanel({
  messages,
  isBuilding,
  onSendMessage,
  onStopStreaming,
  onForceStop,
  isStopPending,
  onRetry,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const userScrolledUp = useRef(false);

  // BEO-587: stop button state — turn red immediately on click, show force stop after 2s
  const [stopClicked, setStopClicked] = useState(false);
  const [showForceStop, setShowForceStop] = useState(false);
  const forceStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset stop state once the build fully settles to idle
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

  // ─── BEO-182: Image state ─────────────────────────────────────────────────
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imagePreparing, setImagePreparing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

  const handleImageFile = useCallback(async (file: File) => {
    setImageError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image must be under 10MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setImageError("Only image files are supported.");
      return;
    }
    // Preview (always — new projects have no projectId until the first build starts)
    const objectUrl = URL.createObjectURL(file);
    setPendingImageFile(file);
    setPendingImagePreview(objectUrl);
    setPendingImageUrl(null);

    if (!projectId) {
      return;
    }

    setImageUploading(true);
    try {
      const { imageUrl } = await uploadImage(file, projectId);
      setPendingImageUrl(imageUrl);
    } catch {
      // Non-fatal: keep local file; image is sent as a data URL when the user sends.
      setImageError(null);
    } finally {
      setImageUploading(false);
    }
  }, [projectId]);

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
        .then(dataUrl => {
          finishSend(dataUrl);
        })
        .catch(() => {
          setImageError("Could not read image.");
        })
        .finally(() => {
          setImagePreparing(false);
        });
      return;
    }
    finishSend();
  }, [
    input,
    isBuilding,
    pendingImageUrl,
    pendingImageFile,
    onSendMessage,
    clearPendingImage,
  ]);

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
  // While a build is in progress, suppress only the ACTIVE (in-flight) building
  // card and replace it with BuildingShimmer. Completed building messages
  // (those with a .summary) must stay visible — hiding them is what caused all
  // prior messages to disappear when the user sent a new iteration prompt.
  const visibleMessages = isBuilding
    ? messages.filter(m => {
        if (m.type !== "building") return true;
        // Keep building cards that have already completed (they carry a summary)
        return !!(m as Extract<ChatMessage, { type: "building" }>).summary;
      })
    : messages;
  const showBuildingShimmer = isBuilding;

  // Send disabled when no text and no image, or out of credits
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
                  onRetry={onRetry}
                  onPopulateInput={populateInputWithoutSend}
                  onImplementPlan={onImplementPlan}
                  userAvatarUrl={userAvatarUrl}
                  userInitials={userInitials}
                />
              </div>
            ))}

            {/* BuildingShimmer or analysing-image indicator */}
            {isBuilding && isAnalysingImage
              ? <AnalysingImageCard />
              : showBuildingShimmer
                ? <BuildingShimmer isIteration={isIterationBuild} />
                : null}
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

      {/* BEO-398: Sticky ImplementBar — between messages and input */}
      {implementSuggestion && (
        <ImplementBar
          summary={implementSuggestion.summary}
          onImplement={() => onImplement?.()}
          onDismiss={() => onDismissImplement?.()}
        />
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-[#e5e5e5] px-3 py-2">
        {/* BEO-396: Chat mode active indicator */}
        {chatModeActive && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F97316]/10 px-2 py-0.5 text-xs font-medium text-[#F97316]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F97316]" />
              Chat mode
            </span>
            <span className="text-xs text-[#9ca3af]">— thinking it through, no build yet</span>
          </div>
        )}

        {/* BEO-182: Image error */}
        {imageError && (
          <p className="mb-1.5 text-xs text-red-500">{imageError}</p>
        )}

        <div className={cn(
          "rounded-xl border bg-white focus-within:border-[#F97316]/50",
          chatModeActive ? "border-[#F97316]/30" : "border-[#e5e5e5]",
        )}>
          {/* BEO-182: Image thumbnail strip */}
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
              placeholder={chatModeActive ? "Chat with Beomz…" : (!projectId ? "What are we building today?" : "Ask Beomz to build or change...")}
              rows={1}
              className="max-h-[120px] w-full resize-none bg-transparent text-sm text-[#1a1a1a] outline-none placeholder:text-[#9ca3af]"
            />
          </div>

          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-0.5">
              {/* BEO-182: Paperclip — opens file picker */}
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
                {/* Stop button — turns red immediately on click */}
                <button
                  onClick={() => {
                    setStopClicked(true);
                    // Arm force-stop reveal after 2s
                    if (forceStopTimerRef.current) clearTimeout(forceStopTimerRef.current);
                    forceStopTimerRef.current = setTimeout(() => {
                      forceStopTimerRef.current = null;
                      setShowForceStop(true);
                    }, 2000);
                    onStopStreaming?.();
                  }}
                  className={cn(
                    "rounded-lg p-1.5 text-white transition-colors",
                    stopClicked
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-[#1a1a1a] hover:bg-[#333]",
                  )}
                  title="Stop generating"
                >
                  <Square size={14} />
                </button>
                {/* Force stop — appears 2s after stop click if still building */}
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

        {/* Hidden file input */}
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
