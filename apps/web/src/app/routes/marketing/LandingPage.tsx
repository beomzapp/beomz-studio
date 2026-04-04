import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "@tanstack/react-router";
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
import { getTaskBreakdown } from "../../../lib/getTaskBreakdown";
import type { PlanTask } from "../../../lib/getTaskBreakdown";
import { TaskPlanEditor } from "../../../components/studio/TaskPlanEditor";
import { BuilderView } from "../../../components/studio/BuilderView";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

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

type Floor = "home" | "plan" | "builder";

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
  const [userMode, setUserMode] = useState<"simple" | "pro">("simple");
  const editableRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const rafRef = useRef<number>(0);
  const currentSizeRef = useRef(72);
  const containerRef = useRef<HTMLDivElement>(null);

  // Floor management
  const [currentFloor, setCurrentFloor] = useState<Floor>("home");
  const [slideAnim, setSlideAnim] = useState<"slide-down" | "slide-up" | null>(null);
  const [promptForBuild, setPromptForBuild] = useState("");
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [approvedTasks, setApprovedTasks] = useState<PlanTask[] | undefined>();
  const nextFloorRef = useRef<Floor | null>(null);

  // Animate floor transition: push both floors together
  const transitionToFloor = useCallback((target: Floor, direction: "down" | "up") => {
    nextFloorRef.current = target;
    setSlideAnim(direction === "down" ? "slide-down" : "slide-up");
    setTimeout(() => {
      setCurrentFloor(target);
      setSlideAnim(null);
      nextFloorRef.current = null;
    }, 600);
  }, []);

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

        setPromptForBuild(prompt);

        if (userMode === "pro" || !planMode) {
          setApprovedTasks(undefined);
          transitionToFloor("builder", "down");
        } else {
          setPlanLoading(true);
          transitionToFloor("plan", "down");
          getTaskBreakdown(prompt).then((tasks) => {
            setPlanTasks(tasks);
            setPlanLoading(false);
          });
        }
      }
    },
    [suggestionIndex, updateFontSize, userMode, planMode, transitionToFloor],
  );

  const handleBackToHome = useCallback(() => {
    transitionToFloor("home", "up");
    setTimeout(() => {
      setPlanTasks([]);
      setPlanLoading(false);
      setApprovedTasks(undefined);
      // Restore cursor and placeholder in editable span
      const el = editableRef.current;
      if (el) {
        el.focus();
        updateFontSize();
      }
    }, 550);
  }, [transitionToFloor, updateFontSize]);

  const handlePlanApprove = useCallback(
    (tasks: PlanTask[]) => {
      setApprovedTasks(tasks);
      transitionToFloor("builder", "down");
    },
    [transitionToFloor],
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
    [],
  );

  useEffect(() => {
    editableRef.current?.focus();
  }, []);

  // Build floor JSX elements
  const homeFloor = (
    <div ref={containerRef} className="h-screen overflow-hidden bg-bg">
      {/* ===== FLOOR 1: Hero (100vh) — UNTOUCHED ===== */}
      <section className="relative h-screen snap-start bg-bg">
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
                : "text-white/40 hover:text-white/60",
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
                : "text-white/40 hover:text-white/60",
            )}
          >
            Pro
          </button>
        </div>

        {/* Hero section */}
        <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-4">
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
                  "before:content-[attr(data-placeholder)] before:text-white/30",
              )}
              style={{ paddingBottom: "0.5em", lineHeight: 1.4 }}
            />
          </h1>

          {/* Typing toolbar */}
          <div
            className={cn(
              "relative z-10 mt-4 flex items-center gap-4 transition-opacity duration-200",
              hasText ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {/* Plan mode toggle — onMouseDown + preventDefault keeps focus on editable span */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setPlanMode(!planMode);
              }}
              title="Review the build plan before generating"
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                planMode
                  ? "border-orange/50 bg-orange/10 text-orange"
                  : "border-border text-white/40 hover:border-white/20 hover:text-white/60",
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
                  : "border-border text-white/40 hover:border-purple/50 hover:text-purple",
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
                    : "border-border text-white/40 hover:border-white/20 hover:text-white/60",
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
        </div>

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
      </section>
    </div>
  );

  const planFloor = (
    <div className="h-screen overflow-hidden bg-[#faf9f6]">
      <section className="relative flex h-full flex-col items-center justify-center">
        <button
          onClick={handleBackToHome}
          className="absolute top-6 right-6 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(0,0,0,0.1)] text-[rgba(0,0,0,0.3)] transition-colors hover:border-[rgba(0,0,0,0.2)] hover:text-[rgba(0,0,0,0.6)]"
          title="Back to home"
        >
          <X size={16} />
        </button>
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[rgba(0,0,0,0.25)]">
            HERE&apos;S MY PLAN
          </p>
          <p className="mt-2 max-w-lg text-base font-semibold text-[#1a1a1a]">
            {promptForBuild}
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs text-[rgba(0,0,0,0.35)]">
            Review the steps below. Edit, reorder, or add your own before I start building.
          </p>
        </div>
        <TaskPlanEditor
          tasks={planTasks}
          onTasksChange={setPlanTasks}
          onApprove={handlePlanApprove}
          isLoading={planLoading}
        />
      </section>
    </div>
  );

  const builderFloor = (
    <div className="h-screen overflow-hidden bg-[#faf9f6]">
      <BuilderView
        initialPrompt={promptForBuild}
        planTasks={approvedTasks}
        light
      />
    </div>
  );

  const floors: Record<Floor, React.ReactNode> = { home: homeFloor, plan: planFloor, builder: builderFloor };
  const isPushing = slideAnim !== null;
  const nextFloor = nextFloorRef.current;

  return (
    <div className="relative h-screen overflow-hidden">
      {isPushing && nextFloor ? (
        /* Push transition: current + next stacked, container slides */
        <div
          className={cn(
            "absolute inset-x-0",
            slideAnim === "slide-down" && "animate-[pushUp_600ms_ease-in-out_forwards]",
            slideAnim === "slide-up" && "animate-[pushDown_600ms_ease-in-out_forwards]",
          )}
          style={{ top: slideAnim === "slide-up" ? "-100vh" : "0" }}
        >
          {slideAnim === "slide-down" ? (
            <>
              <div className="h-screen">{floors[currentFloor]}</div>
              <div className="h-screen">{floors[nextFloor]}</div>
            </>
          ) : (
            <>
              <div className="h-screen">{floors[nextFloor]}</div>
              <div className="h-screen">{floors[currentFloor]}</div>
            </>
          )}
        </div>
      ) : (
        floors[currentFloor]
      )}

      <style>{`
        @keyframes pushUp {
          from { transform: translateY(0); }
          to { transform: translateY(-100vh); }
        }
        @keyframes pushDown {
          from { transform: translateY(0); }
          to { transform: translateY(100vh); }
        }
      `}</style>
    </div>
  );
}
