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
import { DreamItScreen } from "./DreamItScreen";
import { PlanItScreen } from "./PlanItScreen";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

type Screen = "home" | "dream" | "plan";

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
  const [screen, setScreen] = useState<Screen>("home");
  const [userMode, setUserMode] = useState<"simple" | "pro">("simple");
  const [promptForFlow, setPromptForFlow] = useState("");
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

  const [pushAnim, setPushAnim] = useState<"push-up" | "push-down" | null>(null);
  const nextScreenRef = useRef<Screen | null>(null);

  const transitionTo = useCallback((target: Screen) => {
    nextScreenRef.current = target;
    setPushAnim(target === "home" ? "push-down" : "push-up");
    setTimeout(() => {
      setScreen(target);
      setPushAnim(null);
      nextScreenRef.current = null;
    }, 600);
  }, []);

  const handleBackToHome = useCallback(() => {
    transitionTo("home");
  }, [transitionTo]);

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

        if (userMode === "pro" || !planMode) {
          navigate({ to: "/studio/home" });
        } else {
          const isVague = prompt.length < 8 || prompt === "";
          setPromptForFlow(prompt);
          transitionTo(isVague ? "dream" : "plan");
        }
      }
    },
    [navigate, suggestionIndex, updateFontSize, userMode, planMode, transitionTo]
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



  return (
    <div className="relative h-screen overflow-hidden">
      {/* Push transition overlay */}
      {pushAnim && (
        <div
          className={cn(
            "absolute inset-x-0 z-50",
            pushAnim === "push-up" && "animate-[pushUp_600ms_cubic-bezier(0.4,0,0.2,1)_forwards]",
            pushAnim === "push-down" && "animate-[pushDown_600ms_cubic-bezier(0.4,0,0.2,1)_forwards]",
          )}
          style={{ top: pushAnim === "push-down" ? "-100vh" : "0" }}
        >
          {pushAnim === "push-up" ? (
            <>
              <div className="h-screen bg-bg" />
              <div className="h-screen bg-[#faf9f6]" />
            </>
          ) : (
            <>
              <div className="h-screen bg-bg" />
              <div className="h-screen bg-[#faf9f6]" />
            </>
          )}
        </div>
      )}

      {/* Active screen */}
      {screen === "home" ? (
      <div className="relative h-screen bg-bg">
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
      ) : (
      /* Plan/Dream screen — only mounted after prompt submission */
      <div className="h-screen bg-[#faf9f6]">
        {screen === "dream" && <DreamItScreen onBack={handleBackToHome} />}
        {screen === "plan" && (
          <PlanItScreen prompt={promptForFlow} onBack={handleBackToHome} />
        )}
      </div>
      )}

      {/* Push animation keyframes */}
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
