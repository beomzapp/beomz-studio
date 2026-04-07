/**
 * PlanItScreen — full AI-powered planning conversation.
 *
 * Flow:
 *  1. On mount, POST to /plan/analyze with the user's prompt.
 *  2. If confidence >= 0.85 (or max questions reached): stream aiMessage via
 *     typewriter, then show the plan card with Build it / Edit the plan.
 *  3. If confidence < 0.85: stream aiMessage, show answer chips from `options`.
 *  4. User can also type free-text replies at any stage.
 *  5. "Build it" saves a ProjectLaunchIntent and navigates to /studio/project/new.
 *  6. "Edit the plan" prompts the AI to ask what to change.
 *
 * Design rules (BEO-175):
 *  - AI messages: plain flowing text next to the B avatar — NO card box, NO border.
 *  - Answer chips: pill buttons below the AI text.
 *  - Plan card: white rounded card with colour-coded bullet dots.
 *  - No thought bubbles. No hardcoded regex chip logic.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Send } from "lucide-react";
import { getApiBaseUrl } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import { GlobalNav } from "../../../components/layout/GlobalNav";
import { saveProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyzeResult {
  confidence: number;
  summary: string[] | null;
  nextQuestion: string | null;
  options: string[] | null;
  aiMessage: string;
}

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

interface PlanMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  chips?: string[];
  selectedChip?: string;
  isPlan?: boolean;
  planSummary?: string[];
  streaming?: boolean;
}

interface PlanItScreenProps {
  prompt: string;
  onBack: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_COLORS = ["#e8580a", "#388bfd", "#2db870", "#a855f7", "#f59e0b"];
const MAX_QUESTIONS = 3;
const TYPEWRITER_INTERVAL_MS = 18;

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanItScreen({ prompt, onBack }: PlanItScreenProps) {
  const [messages, setMessages] = useState<PlanMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [inputText, setInputText] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [planReady, setPlanReady] = useState(false);

  // Use a ref for history to avoid stale closures in callbacks
  const historyRef = useRef<HistoryEntry[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  // Override dark body background for the light plan page
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#faf9f6";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();

  // ── Scroll ──────────────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  // ── Typewriter ──────────────────────────────────────────────────────────────

  /**
   * Appends a new AI message and streams text into it character by character.
   * Returns a promise that resolves when streaming is complete.
   */
  const typewriterMessage = useCallback(
    (text: string): Promise<void> => {
      const msgId = `ai-${Date.now()}-${Math.random()}`;

      return new Promise((resolve) => {
        setMessages((prev) => [
          ...prev,
          { id: msgId, role: "ai", content: "", streaming: true },
        ]);
        scrollToBottom();

        let i = 0;
        const interval = setInterval(() => {
          i++;
          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((m) => m.id === msgId);
            if (idx !== -1) {
              copy[idx] = { ...copy[idx], content: text.slice(0, i) };
            }
            return copy;
          });
          if (i % 8 === 0) scrollToBottom();
          if (i >= text.length) {
            clearInterval(interval);
            // Finalize: stop streaming flag
            setMessages((prev) => {
              const copy = [...prev];
              const idx = copy.findIndex((m) => m.id === msgId);
              if (idx !== -1) {
                copy[idx] = { ...copy[idx], content: text, streaming: false };
              }
              return copy;
            });
            resolve();
          }
        }, TYPEWRITER_INTERVAL_MS);
      });
    },
    [scrollToBottom],
  );

  // ── Chip helpers ─────────────────────────────────────────────────────────────

  /** Add chips to the most recent non-plan AI message */
  const addChipsToLastAiMessage = useCallback((chips: string[]) => {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "ai" && !copy[i].isPlan) {
          copy[i] = { ...copy[i], chips };
          break;
        }
      }
      return copy;
    });
  }, []);

  /** Remove chips from all messages (after user selects one) */
  const clearChips = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => (m.chips ? { ...m, chips: undefined } : m)),
    );
  }, []);

  // ── API call ─────────────────────────────────────────────────────────────────

  const callAnalyze = useCallback(
    async (history: HistoryEntry[]): Promise<AnalyzeResult | null> => {
      const apiBase = getApiBaseUrl();
      try {
        const res = await fetch(`${apiBase}/plan/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({ prompt, history }),
        });
        if (!res.ok) return null;
        return (await res.json()) as AnalyzeResult;
      } catch {
        return null;
      }
    },
    [prompt, session],
  );

  // ── Core analysis step ───────────────────────────────────────────────────────

  const runAnalysis = useCallback(
    async (history: HistoryEntry[], qCount: number) => {
      setTyping(true);
      const data = await callAnalyze(history);
      setTyping(false);

      if (!data) {
        // Fallback plan when API is unreachable
        const fallbackSummary = [
          "Home / Dashboard — overview and key metrics",
          "Core feature — main functionality",
          "Auth — sign-up, login, protected routes",
          "Settings — profile and preferences",
        ];
        await typewriterMessage(
          `Got it! Here's a build plan for "${prompt}". Let me know if you'd like to adjust anything before we start.`,
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `plan-${Date.now()}`,
            role: "ai",
            content: "",
            isPlan: true,
            planSummary: fallbackSummary,
          },
        ]);
        setPlanReady(true);
        scrollToBottom();
        return;
      }

      // Update shared history ref with AI response
      historyRef.current = [
        ...history,
        { role: "assistant", content: data.aiMessage },
      ];

      if (data.confidence >= 0.85 || qCount >= MAX_QUESTIONS) {
        // Enough context — show plan
        const summary = data.summary ?? [
          "Home / Dashboard — overview",
          "Core feature — main functionality",
          "Auth — sign-up and login",
          "Settings — profile, preferences",
        ];

        await typewriterMessage(data.aiMessage);

        setMessages((prev) => [
          ...prev,
          {
            id: `plan-${Date.now()}`,
            role: "ai",
            content: "",
            isPlan: true,
            planSummary: summary,
          },
        ]);
        setPlanReady(true);
        scrollToBottom();
      } else {
        // Need more context — ask a question with chips
        await typewriterMessage(data.aiMessage);
        if (data.options && data.options.length > 0) {
          addChipsToLastAiMessage(data.options);
        }
        scrollToBottom();
      }
    },
    [callAnalyze, typewriterMessage, addChipsToLastAiMessage, scrollToBottom],
  );

  // ── Mount: first analysis call ───────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return; // wait for Supabase session to resolve before calling API
    if (initRef.current) return;
    initRef.current = true;
    // Show the user's prompt as the first bubble
    setMessages([{ id: `user-init-${Date.now()}`, role: "user", content: prompt }]);
    historyRef.current = [];
    void runAnalysis([], 0);
  }, [authLoading, runAnalysis, prompt]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleChipClick = useCallback(
    (chip: string, allChips?: string[]) => {
      if (typing) return;
      // For "All of the above", join all non-"All" chips as one answer
      const isAll = chip.toLowerCase().startsWith("all") && allChips && allChips.length > 1;
      const answer = isAll
        ? allChips!.filter((c) => !c.toLowerCase().startsWith("all")).join(", ")
        : chip;
      // Mark selected chip visually before clearing
      setMessages((prev) =>
        prev.map((m) => (m.chips ? { ...m, selectedChip: chip } : m))
      );
      setTimeout(() => {
        clearChips();
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: "user", content: answer },
        ]);
        scrollToBottom();
        const newHistory: HistoryEntry[] = [
          ...historyRef.current,
          { role: "user", content: answer },
        ];
        historyRef.current = newHistory;
        const newCount = questionCount + 1;
        setQuestionCount(newCount);
        void runAnalysis(newHistory, newCount);
      }, 150);
    },
    [typing, clearChips, questionCount, runAnalysis, scrollToBottom],
  );

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || typing) return;
    setInputText("");
    clearChips();

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text },
    ]);
    scrollToBottom();

    const newHistory: HistoryEntry[] = [
      ...historyRef.current,
      { role: "user", content: text },
    ];
    historyRef.current = newHistory;

    if (planReady) {
      // Plan is ready — user wants to modify it
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: "ai",
            content: "Sure — what would you like to change?",
          },
        ]);
        scrollToBottom();
        inputRef.current?.focus();
      }, 600);
    } else {
      const newCount = questionCount + 1;
      setQuestionCount(newCount);
      void runAnalysis(newHistory, newCount);
    }
  }, [
    inputText,
    typing,
    clearChips,
    planReady,
    questionCount,
    runAnalysis,
    scrollToBottom,
  ]);

  const handleBuildIt = useCallback(() => {
    const userAnswers = historyRef.current
      .filter((h) => h.role === "user")
      .map((h) => h.content);
    const fullPrompt = [prompt, ...userAnswers].join(". ");

    // Use the most recent plan card
    const planMsg = [...messages].reverse().find((m) => m.isPlan);
    const summary = planMsg?.planSummary ?? [];

    // Build valid PlanStep[] — both title and description must be non-empty
    const steps = summary
      .map((s) => {
        const dashIdx = s.indexOf(" — ");
        const colonIdx = s.indexOf(": ");
        const splitIdx = dashIdx > -1 ? dashIdx : colonIdx > -1 ? colonIdx : -1;
        if (splitIdx > -1) {
          const sep = dashIdx > -1 ? 3 : 2;
          return { title: s.slice(0, splitIdx).trim(), description: s.slice(splitIdx + sep).trim() };
        }
        return { title: s.trim(), description: s.trim() };
      })
      .filter((step) => step.title.length > 0 && step.description.length > 0);

    saveProjectLaunchIntent({
      prompt: fullPrompt,
      approvedPlan: steps.length > 0 ? { summary: summary.join(", "), steps } : undefined,
    });
    navigate({ to: "/studio/project/$id", params: { id: "new" } });
  }, [prompt, messages, navigate]);

  const handleEditPlan = useCallback(() => {
    // Add AI question message and focus input — user types what to change
    setMessages((prev) => [
      ...prev,
      {
        id: `ai-edit-${Date.now()}`,
        role: "ai",
        content: "What would you like to change about the plan?",
      },
    ]);
    scrollToBottom();
    setPlanReady(false); // allow next send to go through runAnalysis
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [scrollToBottom]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-[#faf9f6]">
      {/* Top bar: [back] [logo] ··· [plan mode] ··· [GlobalNav] */}
      <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.07)] px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-[rgba(0,0,0,0.35)] transition-colors hover:text-[#1a1a1a]"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <BeomzLogo className="h-5 w-auto text-[#1a1a1a]" />
        </div>

        <GlobalNav />
      </div>

      {/* Chat area */}
      <div ref={chatRef} className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.map((msg) => {
            // User message — right-aligned dark bubble
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#1a1a1a] px-4 py-2.5 text-sm text-white">
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Plan card — white rounded card, no AI bubble wrapper
            if (msg.isPlan && msg.planSummary) {
              return (
                <div
                  key={msg.id}
                  className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#1a1a1a]">
                      📋 Your build plan
                    </span>
                    <span className="text-xs text-[rgba(0,0,0,0.35)]">
                      {msg.planSummary.length} parts
                    </span>
                  </div>
                  <ul className="mb-4 space-y-2.5">
                    {msg.planSummary.map((item, pi) => (
                      <li key={pi} className="flex items-start gap-2.5">
                        <div
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              PLAN_COLORS[pi % PLAN_COLORS.length],
                          }}
                        />
                        <span className="text-sm text-[#1a1a1a]">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 border-t border-[rgba(0,0,0,0.07)] pt-3">
                    <button
                      onClick={handleBuildIt}
                      className="rounded-xl bg-[#e8580a] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#d14e09]"
                    >
                      ✨ Build it
                    </button>
                    <button
                      onClick={handleEditPlan}
                      className="rounded-xl border border-[rgba(0,0,0,0.1)] px-4 py-2 text-sm text-[#1a1a1a] transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                    >
                      Edit the plan
                    </button>
                  </div>
                </div>
              );
            }

            // AI message — plain flowing text, NO card / NO border
            return (
              <div key={msg.id} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-xs font-bold text-[#e8580a]">
                  B
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm leading-relaxed text-[#1a1a1a]">
                    {msg.content}
                    {msg.streaming && (
                      <span className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[2px] animate-pulse bg-[#9ca3af]" />
                    )}
                  </p>
                  {/* Answer chips — only shown when streaming is done */}
                  {!msg.streaming && msg.chips && msg.chips.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.chips.map((chip) => (
                        <button
                      key={chip}
                      onClick={() => handleChipClick(chip, msg.chips)}
                      disabled={!!msg.selectedChip}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs transition-all",
                        msg.selectedChip === chip
                          ? "border-[#e8580a] bg-[#e8580a] text-white"
                          : msg.selectedChip
                          ? "border-[rgba(0,0,0,0.06)] text-[rgba(0,0,0,0.3)] cursor-default"
                          : "border-[rgba(0,0,0,0.12)] text-[#1a1a1a] hover:border-[#e8580a]/50 hover:text-[#e8580a]",
                      ].join(" ")}
                    >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {typing && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-xs font-bold text-[#e8580a]">
                B
              </div>
              <div className="pt-2.5">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-pulse rounded-full bg-[rgba(0,0,0,0.2)]"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom input — always visible */}
      <div className="border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a reply…"
            className="flex-1 rounded-full border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2.5 text-sm text-[#1a1a1a] placeholder-[rgba(0,0,0,0.25)] outline-none focus:border-[#e8580a]/40"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || typing}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8580a] text-white transition-colors hover:bg-[#d14e09] disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}