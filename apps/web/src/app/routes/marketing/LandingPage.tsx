import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  ListChecks,
  Sparkles,
  Loader2,
  Paperclip,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import { useAuth } from "../../../lib/useAuth";
import { supabase } from "../../../lib/supabase";
import { getClarifyQuestions, generatePlan, type ClarifyQuestion, type PlanBullet } from "../../../lib/planClarify";
import { QuestionsCard } from "../../../components/studio/QuestionsCard";
import { ThoughtLabel } from "../../../components/studio/ThoughtLabel";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

type FlowStep = "home" | "thinking" | "questions" | "planning" | "plan-ready";

const SUGGESTIONS = [
  "a SaaS dashboard",
  "a marketing website",
  "a task manager",
];

const CHAR_TIERS = [
  { maxChars: 40, size: 72, weight: 700 },
  { maxChars: 80, size: 56, weight: 700 },
  { maxChars: 140, size: 40, weight: 600 },
  { maxChars: 220, size: 28, weight: 600 },
  { maxChars: 320, size: 20, weight: 500 },
  { maxChars: Infinity, size: 16, weight: 400 },
];

function placeCursorAtEnd(el: HTMLElement) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function LandingPage() {
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [sphereScale, setSphereScale] = useState(1);
  const [fontSize, setFontSize] = useState(72);
  const [fontWeight, setFontWeight] = useState(700);
  const [hasText, setHasText] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [flowStep, setFlowStep] = useState<FlowStep>("home");
  const [userMode, setUserMode] = useState<"simple" | "pro">("simple");
  const [promptForFlow, setPromptForFlow] = useState("");
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [planBullets, setPlanBullets] = useState<PlanBullet[]>([]);
  const editableRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const rafRef = useRef<number>(0);
  const currentSizeRef = useRef(72);
  const navigate = useNavigate();

  const updateFontSize = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = editableRef.current;
      if (!el) return;
      const len = (el.textContent || "").length;
      setHasText(len > 0);

      if (!len) {
        currentSizeRef.current = 72;
        setFontSize(72);
        setFontWeight(700);
        return;
      }

      const tier = CHAR_TIERS.find((t) => len <= t.maxChars)!;

      if (Math.abs(tier.size - currentSizeRef.current) > 2) {
        currentSizeRef.current = tier.size;
        setFontSize(tier.size);
        setFontWeight(tier.weight);
      }
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const nextIndex = (suggestionIndex + 1) % SUGGESTIONS.length;
        setSuggestionIndex(nextIndex);
        if (editableRef.current) {
          editableRef.current.textContent = SUGGESTIONS[nextIndex];
          placeCursorAtEnd(editableRef.current);
          updateFontSize();
        }
      }
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        document.execCommand("insertLineBreak");
        updateFontSize();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const prompt = editableRef.current?.textContent?.trim() ?? "";
        if (!prompt) return;

        setPromptForFlow(prompt);

        if (userMode === "pro" || !planMode) {
          navigate({ to: "/studio/home" });
        } else {
          // Plan mode — ask AI for clarifying questions
          setFlowStep("thinking");
          setTimeout(() => {
            window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
          }, 50);
          getClarifyQuestions(prompt).then((qs) => {
            if (qs.length === 0) {
              // Clear prompt → skip questions, generate plan directly
              setFlowStep("planning");
              generatePlan(prompt, {}).then((bullets) => {
                setPlanBullets(bullets);
                setFlowStep("plan-ready");
              });
            } else {
              setQuestions(qs);
              setFlowStep("questions");
            }
          });
        }
      }
    },
    [navigate, suggestionIndex, updateFontSize, userMode, planMode]
  );

  const handleInput = useCallback(() => {
    setSphereScale(1.05);
    setTimeout(() => setSphereScale(1), 150);

    const text = editableRef.current?.textContent?.trim() || "";
    if (!text) {
      setSuggestionIndex(-1);
    }

    updateFontSize();
  }, [updateFontSize]);

  const handleEnhance = useCallback(async () => {
    const el = editableRef.current;
    if (!el || enhancing) return;
    const promptText = el.textContent?.trim();
    if (!promptText) return;

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return;

    setEnhancing(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          system:
            "You are a prompt enhancer for an AI app/website builder. Take the user's rough idea and rewrite it as a clear, detailed build prompt in 1-2 sentences. Include the type of app, key features, and target user. Keep it concise but specific. Return ONLY the enhanced prompt, no preamble.",
          messages: [{ role: "user", content: promptText }],
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      const enhanced = data.content[0].text;

      el.textContent = "";
      updateFontSize();
      const words = enhanced.split(" ");
      let i = 0;
      const interval = setInterval(() => {
        if (i < words.length) {
          el.textContent += (i > 0 ? " " : "") + words[i];
          updateFontSize();
          i++;
        } else {
          clearInterval(interval);
          setEnhancing(false);
          placeCursorAtEnd(el);
          el.focus();
        }
      }, 40);
    } catch {
      setEnhancing(false);
      setEnhanceError(true);
      setTimeout(() => setEnhanceError(false), 1000);
    }
  }, [enhancing, updateFontSize]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) setAttachedFile(file);
      e.target.value = "";
    },
    []
  );

  useEffect(() => {
    editableRef.current?.focus();
  }, []);

  const handleBackToHome = useCallback(() => {
    setFlowStep("home");
    setQuestions([]);
    setPlanBullets([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleQuestionsSubmit = useCallback(
    (answers: Record<string, string[]>) => {
      setFlowStep("planning");
      generatePlan(promptForFlow, answers).then((bullets) => {
        setPlanBullets(bullets);
        setFlowStep("plan-ready");
      });
    },
    [promptForFlow],
  );

  const handleSkipAll = useCallback(() => {
    setFlowStep("planning");
    generatePlan(promptForFlow, {}).then((bullets) => {
      setPlanBullets(bullets);
      setFlowStep("plan-ready");
    });
  }, [promptForFlow]);

  return (
    <div className="h-[200vh] overflow-x-hidden bg-bg">
      {/* ===== FLOOR 1: Hero (100vh) — UNTOUCHED ===== */}
      <div className="relative h-screen">
        {/* Top nav */}
        <nav className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4">
          <BeomzLogo className="h-6 w-auto text-white" />
          <div className="flex items-center gap-6">
            <Link
              to="/pricing"
              className="text-sm text-white/50 transition-colors hover:text-white/80"
            >
              Pricing
            </Link>
            <a
              href="https://docs.beomz.com"
              className="text-sm text-white/50 transition-colors hover:text-white/80"
            >
              Docs
            </a>
            {session ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/studio/home"
                  className="rounded-lg bg-orange px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-orange/90"
                >
                  Go to studio
                </Link>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                  }}
                  className="flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/70"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <Link
                to="/auth/login"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>

        {/* Simple/Pro mode toggle */}
        <div className="absolute top-16 right-6 z-10 flex rounded-full border border-border bg-white/5 p-0.5">
          <button
            onClick={() => setUserMode("simple")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              userMode === "simple"
                ? "bg-orange text-white"
                : "text-white/40 hover:text-white/60"
            )}
          >
            Simple
          </button>
          <button
            onClick={() => setUserMode("pro")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              userMode === "pro"
                ? "bg-orange text-white"
                : "text-white/40 hover:text-white/60"
            )}
          >
            Pro
          </button>
        </div>

        {/* Hero section */}
        <section className="relative flex h-full flex-col items-center justify-center overflow-hidden px-4">
          {/* Gradient sphere */}
          <div
            className="pointer-events-none absolute h-[500px] w-[500px] rounded-full opacity-40 blur-[120px] transition-transform duration-150"
            style={{
              background:
                "radial-gradient(circle, var(--color-orange) 0%, var(--color-purple) 60%, transparent 100%)",
              transform: `scale(${sphereScale})`,
            }}
          />

          {/* Attached file pill */}
          {attachedFile && (
            <div className="relative z-10 mb-4 flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1.5 text-sm text-white/60">
              <Paperclip size={14} className="text-orange" />
              <span className="max-w-[200px] truncate">
                {attachedFile.name}
              </span>
              <button
                onClick={() => setAttachedFile(null)}
                className="ml-1 text-white/30 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Prompt headline — fully editable */}
          <h1
            className="relative z-10 w-full max-w-4xl overflow-hidden text-center font-sans text-white"
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: fontWeight,
              lineHeight: 1.4,
              maxHeight: "60vh",
              transition: "font-size 0.15s ease",
            }}
          >
            <span
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              data-placeholder="Build "
              className={cn(
                "outline-none caret-orange inline-block min-w-[1ch] text-center",
                !hasText &&
                  "before:content-[attr(data-placeholder)] before:text-white/30"
              )}
              style={{ paddingBottom: "0.5em", lineHeight: 1.4 }}
            />
          </h1>

          {/* Typing toolbar */}
          <div
            className={cn(
              "relative z-10 mt-4 flex items-center gap-4 transition-opacity duration-200",
              hasText ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {/* Plan mode toggle */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setPlanMode(!planMode); }}
              title="Review the build plan before generating"
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                planMode
                  ? "border-orange/50 bg-orange/10 text-orange"
                  : "border-border text-white/40 hover:border-white/20 hover:text-white/60"
              )}
            >
              <ListChecks size={14} />
              Plan
            </button>

            {/* Enhance with AI */}
            <button
              onMouseDown={(e) => { e.preventDefault(); handleEnhance(); }}
              title="Enhance prompt with AI"
              disabled={enhancing}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                enhanceError
                  ? "border-red-500 text-red-400"
                  : "border-border text-white/40 hover:border-purple/50 hover:text-purple"
              )}
            >
              {enhancing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Enhance
            </button>

            {/* File upload */}
            <button
              onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-white/40 transition-all hover:border-white/20 hover:text-white/60"
            >
              <Paperclip size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.fig"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Suggestion strip */}
          <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-3">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s}
                onClick={() => {
                  if (editableRef.current) {
                    if (suggestionIndex === i) {
                      editableRef.current.textContent = "";
                      setSuggestionIndex(-1);
                    } else {
                      editableRef.current.textContent = s;
                      setSuggestionIndex(i);
                      placeCursorAtEnd(editableRef.current);
                    }
                    editableRef.current.focus();
                    updateFontSize();
                  }
                }}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-all",
                  i === suggestionIndex
                    ? "border-orange/50 bg-orange/10 text-orange"
                    : "border-border text-white/40 hover:border-white/20 hover:text-white/60"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <p className="relative z-10 mt-4 text-sm text-white/30">
            <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-white/50">
              Tab
            </kbd>{" "}
            to autocomplete ·{" "}
            <kbd className="rounded border border-border px-1.5 py-0.5 text-xs text-white/50">
              Enter
            </kbd>{" "}
            to build
          </p>
        </section>

        {/* Mini footer pinned to bottom of viewport */}
        <div className="absolute bottom-0 left-0 right-0 z-10 px-6 py-3 text-center">
          <p className="text-[11px] text-white/20">
            <a href="https://beomz.com" className="hover:text-white/40 transition-colors">beomz.com</a>
            {" · "}
            <a href="https://crypto.beomz.com" className="hover:text-white/40 transition-colors">crypto.beomz.com</a>
            {" · "}
            <a href="https://token.beomz.com" className="hover:text-white/40 transition-colors">token.beomz.com</a>
            {" · "}
            <a href="https://token.beomz.com" className="hover:text-white/40 transition-colors">$BEOMZ token</a>
            {" · "}
            <span>&copy; Beomz 2026</span>
          </p>
        </div>
      </div>

      {/* ===== FLOOR 2: Questions / Plan flow ===== */}
      <div className="relative min-h-screen bg-[#faf9f6]">
        {/* Close button */}
        {flowStep !== "home" && (
          <button
            onClick={handleBackToHome}
            className="absolute top-6 right-6 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(0,0,0,0.1)] text-[rgba(0,0,0,0.3)] transition-colors hover:border-[rgba(0,0,0,0.2)] hover:text-[rgba(0,0,0,0.6)]"
            title="Back to home"
          >
            <X size={16} />
          </button>
        )}

        <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
          {/* Prompt echo */}
          {flowStep !== "home" && (
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[rgba(0,0,0,0.25)]">
                YOUR PROMPT
              </p>
              <p className="mt-2 max-w-lg text-base font-semibold text-[#1a1a1a]">
                {promptForFlow}
              </p>
            </div>
          )}

          {/* Thinking state */}
          {(flowStep === "thinking" || flowStep === "planning") && (
            <ThoughtLabel visible />
          )}

          {/* Questions card */}
          {flowStep === "questions" && questions.length > 0 && (
            <QuestionsCard
              questions={questions}
              onSubmit={handleQuestionsSubmit}
              onSkipAll={handleSkipAll}
            />
          )}

          {/* Plan bullets */}
          {flowStep === "plan-ready" && planBullets.length > 0 && (
            <div className="mx-auto w-full max-w-xl">
              <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#6b7280]">
                    Build plan
                  </h3>
                  <span className="text-xs text-[#6b7280]">
                    {planBullets.length} step{planBullets.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {planBullets.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.01)] px-4 py-3"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F97316]/10 text-xs font-bold text-[#F97316]">
                        {i + 1}
                      </span>
                      <div>
                        <span className="text-sm font-semibold text-[#1a1a1a]">
                          {b.label}
                        </span>
                        {b.description && (
                          <p className="mt-0.5 text-xs text-[#6b7280]">
                            {b.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-[#e5e7eb] pt-4">
                  <button
                    onClick={() => navigate({ to: "/studio/home" })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
                  >
                    Start building
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Empty home state for floor 2 */}
          {flowStep === "home" && (
            <p className="text-sm text-[rgba(0,0,0,0.2)]">
              Enable Plan mode and press Enter to start
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
