/**
 * AIMessage — generic AI-side chat bubble used by message types that have no
 * specialised component.
 *
 * Contract (BEO-725):
 *   - Plain `chat_response` (no implementPlan): renders TypewriterText if
 *     `isNewMessage`, plain MarkdownText otherwise. Streaming responses
 *     show a pulsing cursor.
 *   - `clarifying_question`, `question_answer`: plain markdown body + copy.
 *   - `pre_build_ack`: minimal one-liner, no avatar or container.
 *   - `error`: red-tinted card with retry / report buttons.
 *   - `image_intent`, `url_research`: rich cards lifted unchanged from the
 *     legacy ChatMessage.tsx.
 */
import { useState } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { Send } from "lucide-react";
import { BAvatar } from "./Avatars";
import { CopyButton, MarkdownText } from "./MarkdownText";
import { TypewriterText } from "./TypewriterText";

function AIShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

// ─── chat_response (no implementPlan) ─────────────────────────────────────────

interface ChatResponseProps {
  message: Extract<ChatMessage, { type: "chat_response" }>;
  isNewMessage: boolean;
}

export function AIChatResponse({ message, isNewMessage }: ChatResponseProps) {
  return (
    <AIShell>
      <div className="text-sm leading-relaxed text-[#374151] break-words">
        {isNewMessage && !message.streaming ? (
          <TypewriterText text={message.content} />
        ) : (
          <>
            <MarkdownText text={message.content} />
            {message.streaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#F97316] align-middle" />
            )}
          </>
        )}
      </div>
      {!message.streaming && message.content && (
        <div className="mt-1.5 flex justify-end">
          <CopyButton content={message.content} />
        </div>
      )}
    </AIShell>
  );
}

// ─── clarifying_question ──────────────────────────────────────────────────────

interface ClarifyingProps {
  message: Extract<ChatMessage, { type: "clarifying_question" }>;
}

export function AIClarifyingQuestion({ message }: ClarifyingProps) {
  return (
    <AIShell>
      <MarkdownText text={message.content} />
      <div className="mt-1.5 flex justify-end">
        <CopyButton content={message.content} />
      </div>
    </AIShell>
  );
}

// ─── question_answer ──────────────────────────────────────────────────────────

interface QuestionAnswerProps {
  message: Extract<ChatMessage, { type: "question_answer" }>;
}

export function AIQuestionAnswer({ message }: QuestionAnswerProps) {
  return (
    <AIShell>
      <MarkdownText text={message.content} />
      <div className="mt-1.5 flex justify-end">
        <CopyButton content={message.content} />
      </div>
    </AIShell>
  );
}

// ─── pre_build_ack ────────────────────────────────────────────────────────────

interface PreBuildAckProps {
  message: Extract<ChatMessage, { type: "pre_build_ack" }>;
}

export function AIPreBuildAck({ message }: PreBuildAckProps) {
  return (
    <p className="text-sm leading-relaxed text-[#374151] break-words">
      {message.content}
    </p>
  );
}

// ─── error ────────────────────────────────────────────────────────────────────

interface ErrorProps {
  message: Extract<ChatMessage, { type: "error" }>;
  onRetry?: () => void;
  onReportIssue?: () => void;
}

export function AIError({ message, onRetry, onReportIssue }: ErrorProps) {
  return (
    <AIShell>
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
        <p className="text-sm font-medium text-red-600">Build ran into an issue</p>
        {message.content && (
          <p className="mt-1 text-xs text-red-400/80 leading-relaxed">{message.content}</p>
        )}
        <div className="mt-2.5 flex gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-lg bg-[#F97316] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#ea6c10]"
            >
              Retry
            </button>
          )}
          {onReportIssue && (
            <button
              onClick={onReportIssue}
              className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.02)]"
            >
              Report issue
            </button>
          )}
        </div>
      </div>
    </AIShell>
  );
}

// ─── image_intent — lifted unchanged ──────────────────────────────────────────

type ImageIntentMsg = Extract<ChatMessage, { type: "image_intent" }>;

const INTENT_PRIMARY_LABEL: Record<ImageIntentMsg["intent"], string | null> = {
  logo: "Yes, use it in the header and favicon",
  reference: "Yes, match this layout and style",
  error: "Yes, diagnose and fix this",
  theme: "Yes, apply these colors and fonts",
  general: null,
};

interface ImageIntentProps {
  message: ImageIntentMsg;
  onConfirm?: (prompt: string, imageUrl: string) => void;
}

export function AIImageIntent({ message, onConfirm }: ImageIntentProps) {
  const [dismissed, setDismissed] = useState(false);
  const [generalInput, setGeneralInput] = useState("");

  if (dismissed) {
    return (
      <AIShell>
        <p className="text-sm text-zinc-400 italic">Image attached for context.</p>
      </AIShell>
    );
  }

  const primaryLabel = message.ctaText ?? INTENT_PRIMARY_LABEL[message.intent];

  const handlePrimary = (prompt: string) => {
    setDismissed(true);
    onConfirm?.(prompt, message.imageUrl);
  };

  return (
    <AIShell>
      <div className="space-y-2.5">
        <img
          src={message.imageUrl}
          alt="Uploaded"
          className="h-20 w-auto max-w-[160px] rounded-lg object-cover"
        />
        <p className="text-sm leading-relaxed text-[#374151]">{message.description}</p>
        <div className="flex flex-col gap-2">
          {primaryLabel ? (
            <button
              onClick={() => handlePrimary(primaryLabel)}
              className="w-full rounded-lg bg-[#F97316] px-3 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-[#ea6c10]"
            >
              {primaryLabel}
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={generalInput}
                onChange={e => setGeneralInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && generalInput.trim()) {
                    handlePrimary(generalInput.trim());
                  }
                }}
                placeholder="What would you like me to do with this image?"
                className="min-w-0 flex-1 rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-[#F97316]/50"
              />
              <button
                onClick={() => generalInput.trim() && handlePrimary(generalInput.trim())}
                disabled={!generalInput.trim()}
                className="rounded-lg bg-[#F97316] p-2 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
              >
                <Send size={14} />
              </button>
            </div>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#6b7280] transition-colors hover:bg-[rgba(0,0,0,0.02)]"
          >
            No, just attach it
          </button>
        </div>
      </div>
    </AIShell>
  );
}

// ─── url_research — lifted unchanged ──────────────────────────────────────────

interface UrlResearchProps {
  message: Extract<ChatMessage, { type: "url_research" }>;
}

export function AIUrlResearch({ message }: UrlResearchProps) {
  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div
        className="min-w-0 flex-1 rounded-xl p-3"
        style={{
          background: "rgba(255, 104, 0, 0.06)",
          border: "1px solid rgba(255, 104, 0, 0.15)",
        }}
      >
        <p className="text-sm font-medium text-[#374151]">
          🔍 Here&apos;s what I found about{" "}
          <span className="font-semibold">{message.domain}</span>:
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{message.summary}</p>
        {message.features.length > 0 && (
          <ul className="mt-2 space-y-1">
            {message.features.slice(0, 6).map((feature, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-[#374151]">
                <span className="flex-shrink-0 select-none text-zinc-400">•</span>
                <span className="min-w-0">{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
