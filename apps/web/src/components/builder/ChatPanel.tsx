/**
 * ChatPanel — V1 chat sidebar ported to V2.
 * Light mode, cream bg, SSE streaming via Railway API.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Square,
  Paperclip,
  ArrowDown,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "../../lib/cn";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  onSendMessage: (text: string) => void;
  onStopStreaming?: () => void;
  width?: number;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded p-1 text-[#9ca3af] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[#6b7280]"
      title="Copy"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

export function ChatPanel({
  messages,
  isStreaming,
  streamingText,
  onSendMessage,
  onStopStreaming,
  width = 380,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollBtn(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSendMessage(text);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Auto-resize textarea
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    [],
  );

  return (
    <div
      className="flex shrink-0 flex-col border-r border-[#e5e7eb] bg-[#faf9f6]"
      style={{ width }}
    >
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-[#9ca3af]">
              Describe what you want to build or change
            </p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "group flex",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "rounded-br-md bg-[#1a1a1a] text-white"
                    : "rounded-bl-md border border-[#e5e7eb] bg-white text-[#1a1a1a]",
                )}
              >
                {msg.content}
                {msg.role === "assistant" && (
                  <div className="absolute -right-8 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyButton text={msg.content} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-sm leading-relaxed text-[#1a1a1a]">
                {streamingText}
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#9ca3af]" />
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {isStreaming && !streamingText && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-[#e5e7eb] bg-white px-3.5 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9ca3af]" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9ca3af]" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9ca3af]" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={chatEndRef} />
      </div>

      {/* Scroll to bottom FAB */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-[#e5e7eb] bg-white p-2 shadow-md transition-colors hover:bg-[rgba(0,0,0,0.02)]"
        >
          <ArrowDown size={14} className="text-[#6b7280]" />
        </button>
      )}

      {/* Input bar */}
      <div className="border-t border-[#e5e7eb] px-3 py-3">
        <div className="flex items-end gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 focus-within:border-[#F97316]/50">
          <button
            className="shrink-0 rounded p-1 text-[#9ca3af] transition-colors hover:text-[#6b7280]"
            title="Attach file"
            onClick={() => {/* TODO */}}
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Beomz to build or change..."
            rows={1}
            className="max-h-[120px] flex-1 resize-none bg-transparent text-sm text-[#1a1a1a] outline-none placeholder:text-[#9ca3af]"
          />
          {isStreaming ? (
            <button
              onClick={onStopStreaming}
              className="shrink-0 rounded-lg bg-[#1a1a1a] p-1.5 text-white transition-colors hover:bg-[#333]"
              title="Stop generating"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 rounded-lg bg-[#F97316] p-1.5 text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-40"
              title="Send"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
