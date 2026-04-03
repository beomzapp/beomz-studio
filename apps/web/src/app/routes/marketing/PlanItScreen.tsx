import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Send } from "lucide-react";
import { cn } from "../../../lib/cn";

interface ChatMessage {
  role: "ai" | "user";
  content: string;
  chips?: string[];
  isPlan?: boolean;
}

function getChipsForPrompt(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  if (/financ|money|budget|expense|invoice/.test(lower))
    return ["Track spending", "Manage invoices", "View investments", "Something else"];
  if (/saas|dashboard|admin|manage/.test(lower))
    return ["Manage projects", "View analytics", "Team collaboration", "Something else"];
  return ["Just for me", "A team or business", "I want to sell it", "Something else"];
}

function getCoreFeature(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/financ|money|budget/.test(lower)) return "Finance tracker — expenses, budgets, reports";
  if (/saas|dashboard/.test(lower)) return "Dashboard — metrics, charts, data tables";
  if (/shop|store|ecommerce/.test(lower)) return "Product catalog — listings, cart, checkout";
  if (/chat|messag/.test(lower)) return "Messaging — real-time chat, conversations";
  if (/task|todo|project/.test(lower)) return "Task board — kanban, assignments, deadlines";
  return "Core feature — main functionality";
}

const PLAN_DOTS = [
  { color: "#e8580a", label: "Home / Dashboard", desc: "overview, key metrics" },
  { color: "#388bfd", label: "", desc: "" }, // filled dynamically
  { color: "#2db870", label: "Auth", desc: "sign up, login, protected routes" },
  { color: "#a855f7", label: "Settings", desc: "profile, preferences" },
];

interface PlanItScreenProps {
  prompt: string;
  onBack: () => void;
}

export function PlanItScreen({ prompt, onBack }: PlanItScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [phase, setPhase] = useState(0); // 0=init, 1=q1shown, 2=q1answered, 3=q2shown, 4=q2answered, 5=plan
  const [inputText, setInputText] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const navigate = useNavigate();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  const addAiMessage = useCallback(
    (msg: Omit<ChatMessage, "role">, delay: number) => {
      setTyping(true);
      scrollToBottom();
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setTyping(false);
          setMessages((prev) => [...prev, { role: "ai", ...msg }]);
          scrollToBottom();
          resolve();
        }, delay);
      });
    },
    [scrollToBottom]
  );

  // Initial conversation flow (runs once)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      await addAiMessage({ content: `Got it — ${prompt}. Good choice. 💡` }, 600);
      await addAiMessage({ content: "Before I start planning, one quick question:" }, 800);
      const chips = getChipsForPrompt(prompt);
      await addAiMessage(
        { content: "What's the main purpose of this project?", chips },
        600
      );
      setPhase(1);
    })();
  }, [prompt, addAiMessage]);

  const handleChipClick = useCallback(
    async (chip: string) => {
      // Add user message
      setMessages((prev) => [...prev, { role: "user", content: chip }]);
      scrollToBottom();

      if (phase === 1) {
        setPhase(2);
        // Q2
        await addAiMessage(
          {
            content: "And what should be the main thing users can do?",
            chips: ["View data", "Create content", "Communicate", "Something else"],
          },
          800
        );
        setPhase(3);
      } else if (phase === 3) {
        setPhase(4);
        // Plan summary
        const core = getCoreFeature(prompt);
        await addAiMessage(
          { content: "", isPlan: true },
          1000
        );
        // Store core feature for plan card rendering
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last.isPlan) {
            last.content = core;
          }
          return copy;
        });
        setPhase(5);
      }
    },
    [phase, prompt, addAiMessage, scrollToBottom]
  );

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    scrollToBottom();

    // Treat as chip selection for current phase
    if (phase === 1 || phase === 3) {
      handleChipClick(text);
    }
  }, [inputText, phase, handleChipClick, scrollToBottom]);

  // Thought bubbles for answered questions
  const answeredCount = messages.filter((m) => m.role === "user").length;
  const BUBBLE_POSITIONS = [
    { pos: "top-20 right-8", bg: "#fff4ee", text: "#e8580a" },
    { pos: "bottom-28 left-8", bg: "#f0f7ff", text: "#388bfd" },
  ];

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#faf9f6]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.07)] px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-[rgba(0,0,0,0.35)] transition-colors hover:text-[#1a1a1a]"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-lg font-bold text-[#1a1a1a]">
            beomz<span className="text-[#e8580a]">.</span>
          </span>
        </div>
        <span className="rounded-full border border-[#388bfd]/30 bg-[#388bfd]/5 px-3 py-1 text-xs font-medium text-[#388bfd]">
          ◈ plan mode
        </span>
      </div>

      {/* Echo */}
      <div className="border-b border-[rgba(0,0,0,0.07)] px-6 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[rgba(0,0,0,0.25)]">
          YOU SAID
        </p>
        <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{prompt}</p>
      </div>

      {/* Thought bubbles */}
      {messages
        .filter((m) => m.role === "user")
        .slice(0, 2)
        .map((m, i) => (
          <div
            key={`tb-${i}`}
            className={cn(
              "pointer-events-none absolute z-10 hidden lg:block",
              BUBBLE_POSITIONS[i]?.pos
            )}
            style={{ animation: "bubblePop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
          >
            <div
              className="relative rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm"
              style={{
                backgroundColor: BUBBLE_POSITIONS[i]?.bg,
                color: BUBBLE_POSITIONS[i]?.text,
              }}
            >
              {m.content}
              <div
                className="absolute -bottom-2 left-4 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: BUBBLE_POSITIONS[i]?.bg }}
              />
              <div
                className="absolute -bottom-4 left-2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: BUBBLE_POSITIONS[i]?.bg }}
              />
            </div>
          </div>
        ))}

      {/* Chat area */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="rounded-2xl rounded-br-md bg-[#1a1a1a] px-4 py-2.5 text-sm text-white">
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Plan card
            if (msg.isPlan) {
              const core = msg.content;
              const dots = [...PLAN_DOTS];
              dots[1] = { color: "#388bfd", label: core.split("—")[0]?.trim() || "Core feature", desc: core.split("—")[1]?.trim() || "main functionality" };
              return (
                <div key={i} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-xs font-bold text-[#e8580a]">
                    B
                  </div>
                  <div className="flex-1 rounded-2xl rounded-tl-md border border-[rgba(0,0,0,0.07)] bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[#1a1a1a]">
                        📋 Your build plan
                      </h3>
                      <span className="rounded-full bg-[rgba(0,0,0,0.05)] px-2.5 py-0.5 text-xs text-[rgba(0,0,0,0.4)]">
                        4 parts
                      </span>
                    </div>
                    <div className="mb-4 border-t border-[rgba(0,0,0,0.07)]" />
                    <ul className="space-y-3">
                      {dots.map((d, di) => (
                        <li key={di} className="flex items-start gap-3">
                          <div
                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: d.color }}
                          />
                          <div>
                            <span className="text-sm font-medium text-[#1a1a1a]">
                              {d.label}
                            </span>
                            {d.desc && (
                              <span className="text-sm text-[rgba(0,0,0,0.35)]">
                                {" "}
                                — {d.desc}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 border-t border-[rgba(0,0,0,0.07)]" />
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => navigate({ to: "/studio/home" })}
                        className="rounded-xl bg-[#e8580a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d14e09]"
                      >
                        ✨ Build this
                      </button>
                      <button className="rounded-xl border border-[rgba(0,0,0,0.1)] px-4 py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[rgba(0,0,0,0.03)]">
                        Edit the plan
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // Normal AI message
            return (
              <div key={i} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-xs font-bold text-[#e8580a]">
                  B
                </div>
                <div className="flex-1">
                  <div className="rounded-2xl rounded-tl-md border border-[rgba(0,0,0,0.07)] bg-white px-4 py-3 text-sm text-[#1a1a1a] shadow-sm">
                    {msg.content}
                    {msg.chips && msg.chips.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.chips.map((chip) => (
                          <button
                            key={chip}
                            onClick={() => handleChipClick(chip)}
                            className="rounded-full border border-[rgba(0,0,0,0.1)] bg-[#faf9f6] px-3 py-1 text-xs font-medium text-[#1a1a1a] transition-all hover:border-[#e8580a]/40 hover:bg-[#e8580a]/5 hover:text-[#e8580a]"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {typing && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-xs font-bold text-[#e8580a]">
                B
              </div>
              <div className="rounded-2xl rounded-tl-md border border-[rgba(0,0,0,0.07)] bg-white px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[rgba(0,0,0,0.2)]" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[rgba(0,0,0,0.2)]" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[rgba(0,0,0,0.2)]" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom input */}
      <div className="border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a reply..."
            className="flex-1 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-[rgba(0,0,0,0.25)] outline-none focus:border-[#e8580a]/40"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8580a] text-white transition-colors hover:bg-[#d14e09] disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bubblePop {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
