import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { X, Loader2 } from "lucide-react";
import { saveProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import { getApiBaseUrl } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AnalyzeResponse {
  confidence: number;
  summary: string[] | null;
  nextQuestion: string | null;
  aiMessage: string;
  options?: string[];
}

interface ChatEntry {
  role: "ai" | "user";
  content: string;
  summary?: string[];
  question?: string;
  options?: string[];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function analyzePlan(
  prompt: string,
  history: { role: string; content: string }[],
): Promise<AnalyzeResponse> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${getApiBaseUrl()}/plan/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt, history }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json() as AnalyzeResponse;
  } catch {
    // Fallback — high confidence with generic summary
    return {
      confidence: 0.9,
      summary: [
        `Build ${prompt}`,
        "Set up pages and navigation",
        "Add core features and interactions",
        "Style with responsive design",
      ],
      nextQuestion: null,
      aiMessage: `Hey! So you want to build ${prompt}. I've got a solid picture of what you need — here's what I'm planning to build:`,
    };
  }
}

// ─────────────────────────────────────────────
// Typewriter hook
// ─────────────────────────────────────────────

function useTypewriter(text: string, speed = 30) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) return;
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

// ─────────────────────────────────────────────
// BeomzAvatar
// ─────────────────────────────────────────────

function BeomzAvatar() {
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#F97316] text-sm font-bold text-white">
      B
    </div>
  );
}

// ─────────────────────────────────────────────
// AI Message with typewriter
// ─────────────────────────────────────────────

function AiMessage({
  content,
  summary,
  onTypeDone,
}: {
  content: string;
  summary?: string[];
  onTypeDone?: () => void;
}) {
  const { displayed, done } = useTypewriter(content, 25);

  useEffect(() => {
    if (done && onTypeDone) onTypeDone();
  }, [done, onTypeDone]);

  return (
    <div className="flex items-start gap-3 animate-[fadeIn_300ms_ease-out]">
      <BeomzAvatar />
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm leading-relaxed text-[#374151]">
          {displayed}
          {!done && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#9ca3af]" />}
        </p>
        {done && summary && summary.length > 0 && (
          <div className="mt-4 space-y-2 animate-[fadeIn_400ms_ease-out]">
            {summary.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 text-sm text-[#374151]"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <span className="mt-0.5 text-base">
                  {["🎨", "🔧", "📱", "🗄️", "⚡"][i % 5]}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Question chips
// ─────────────────────────────────────────────

function QuestionChips({
  question,
  options,
  onAnswer,
}: {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
}) {
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showOtherInput) inputRef.current?.focus();
  }, [showOtherInput]);

  return (
    <div className="flex items-start gap-3 animate-[fadeIn_300ms_ease-out]">
      <BeomzAvatar />
      <div className="min-w-0 flex-1 pt-1">
        <p className="mb-3 text-sm leading-relaxed text-[#374151]">{question}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onAnswer(opt)}
              className="rounded-full border border-[#F97316]/30 bg-[#faf9f6] px-3.5 py-1.5 text-sm text-[#F97316] transition-all hover:border-[#F97316] hover:bg-[#F97316]/5"
            >
              {opt}
            </button>
          ))}
          {!showOtherInput ? (
            <button
              onClick={() => setShowOtherInput(true)}
              className="rounded-full border border-[#e5e5e5] bg-white px-3.5 py-1.5 text-sm text-[#9ca3af] transition-all hover:border-[#F97316]/30 hover:text-[#F97316]"
            >
              Other...
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && otherText.trim()) {
                    onAnswer(otherText.trim());
                  }
                }}
                placeholder="Type your answer..."
                className="rounded-full border border-[#F97316]/30 bg-white px-3.5 py-1.5 text-sm text-[#1a1a1a] outline-none focus:border-[#F97316] placeholder:text-[#9ca3af]"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// User message bubble
// ─────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end animate-[fadeIn_200ms_ease-out]">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#1a1a1a] px-4 py-2.5 text-sm text-white">
        {content}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PlanPage
// ─────────────────────────────────────────────

export function PlanPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/plan" }) as { q?: string };
  const prompt = search.q ?? "";

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBuildButton, setShowBuildButton] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<{
    question: string;
    options: string[];
  } | null>(null);
  const [summaryBullets, setSummaryBullets] = useState<string[]>([]);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const hasStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, currentQuestion, showBuildButton]);

  // Kick off the analysis on mount
  useEffect(() => {
    if (hasStartedRef.current || !prompt) return;
    hasStartedRef.current = true;

    setLoading(true);
    analyzePlan(prompt, []).then((res) => {
      setLoading(false);
      historyRef.current = [
        { role: "user", content: prompt },
        { role: "assistant", content: res.aiMessage },
      ];

      if (res.confidence >= 0.85 && res.summary) {
        // High confidence — show summary
        setEntries([{
          role: "ai",
          content: res.aiMessage,
          summary: res.summary,
        }]);
        setSummaryBullets(res.summary);
      } else if (res.nextQuestion) {
        // Low confidence — ask questions
        setEntries([{ role: "ai", content: res.aiMessage }]);
        setCurrentQuestion({
          question: res.nextQuestion,
          options: res.options ?? ["Yes", "No", "Not sure"],
        });
      } else {
        // Fallback — show message with summary if available
        setEntries([{
          role: "ai",
          content: res.aiMessage,
          summary: res.summary ?? undefined,
        }]);
        if (res.summary) setSummaryBullets(res.summary);
      }
    });
  }, [prompt]);

  // Show build button after summary is displayed + typing done
  const handleAiTypeDone = useCallback(() => {
    if (summaryBullets.length > 0) {
      setTimeout(() => setShowBuildButton(true), 600);
    }
  }, [summaryBullets]);

  // Handle answer to clarifying question
  const handleAnswer = useCallback(
    (answer: string) => {
      setCurrentQuestion(null);

      // Add user message
      setEntries((prev) => [...prev, { role: "user", content: answer }]);
      historyRef.current.push({ role: "user", content: answer });

      // Fetch next question or summary
      setLoading(true);
      analyzePlan(prompt, historyRef.current).then((res) => {
        setLoading(false);
        historyRef.current.push({ role: "assistant", content: res.aiMessage });

        if (res.confidence >= 0.85 && res.summary) {
          // We have enough info — show summary
          setEntries((prev) => [...prev, {
            role: "ai",
            content: res.aiMessage,
            summary: res.summary!,
          }]);
          setSummaryBullets(res.summary);
        } else if (res.nextQuestion) {
          // Ask another question
          setEntries((prev) => [...prev, { role: "ai", content: res.aiMessage }]);
          setCurrentQuestion({
            question: res.nextQuestion,
            options: res.options ?? ["Yes", "No", "Not sure"],
          });
        }
      });
    },
    [prompt],
  );

  // Handle "Build it" click
  const handleBuild = useCallback(() => {
    saveProjectLaunchIntent({
      prompt,
      approvedPlan: {
        summary: summaryBullets.join(". "),
        steps: summaryBullets.map((s) => ({
          title: s.split(" ").slice(0, 4).join(" "),
          description: s,
        })),
      },
    });
    navigate({ to: "/studio/project/$id", params: { id: "new" } });
  }, [navigate, prompt, summaryBullets]);

  // Handle close — go back to landing
  const handleClose = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  return (
    <div className="h-screen bg-[#faf9f6] flex flex-col">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="fixed top-6 right-6 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(0,0,0,0.1)] text-[rgba(0,0,0,0.3)] transition-colors hover:border-[rgba(0,0,0,0.2)] hover:text-[rgba(0,0,0,0.6)]"
        title="Back to home"
      >
        <X size={16} />
      </button>

      {/* Chat column */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="mx-auto max-w-[680px] px-6 py-16 space-y-6">
          {/* Entries */}
          {entries.map((entry, i) =>
            entry.role === "user" ? (
              <UserMessage key={i} content={entry.content} />
            ) : (
              <AiMessage
                key={i}
                content={entry.content}
                summary={entry.summary}
                onTypeDone={i === entries.length - 1 ? handleAiTypeDone : undefined}
              />
            ),
          )}

          {/* Current question (clarifying) */}
          {currentQuestion && (
            <QuestionChips
              question={currentQuestion.question}
              options={currentQuestion.options}
              onAnswer={handleAnswer}
            />
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-start gap-3 animate-[fadeIn_200ms_ease-out]">
              <BeomzAvatar />
              <div className="pt-2">
                <Loader2 size={16} className="animate-spin text-[#9ca3af]" />
              </div>
            </div>
          )}

          {/* Build it button */}
          {showBuildButton && (
            <div className="pt-4 animate-[fadeIn_400ms_ease-out]">
              <button
                onClick={handleBuild}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#ea6c10]"
              >
                Build it &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
