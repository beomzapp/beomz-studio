import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  ListChecks,
  Sparkles,
  Loader2,
  Paperclip,
  X,
  Mic,
  SlidersHorizontal,
  Palette,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import { useAuth } from "../../../lib/useAuth";
import { saveProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import { GlobalNav } from "../../../components/layout/GlobalNav";
import { AuthModal } from "../../../components/auth/AuthModal";
import { usePricingModal } from "../../../contexts/PricingModalContext";
import MyndlabLogo from "../../../assets/myndlab-logo.svg?react";
import { enhancePrompt } from "../../../lib/api";
import { MarketingNav } from "../../../components/marketing/MarketingNav";

const MAX_ATTACHMENTS = 3;

function AttachmentPill({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-white/5 pl-1.5 pr-3 py-1 text-sm text-white/60 max-w-[240px]">
      {isImage && objectUrl ? (
        <img
          src={objectUrl}
          alt={file.name}
          className="rounded-full object-cover shrink-0"
          style={{ height: 24, width: 24, maxHeight: 80 }}
        />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 shrink-0">
          <Paperclip size={12} className="text-orange" />
        </span>
      )}
      <span className="truncate leading-none">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto shrink-0 text-white/30 hover:text-white transition-colors"
        aria-label={`Remove ${file.name}`}
      >
        <X size={13} />
      </button>
    </div>
  );
}

const SUGGESTION_POOL = [
  "a SaaS dashboard", "a marketing website", "a task manager",
  "a CRM system", "an e-commerce store", "a project tracker",
  "a budget planner", "a social media scheduler", "an analytics dashboard",
  "a booking system", "a recipe app", "a fitness tracker",
  "an invoice generator", "a kanban board", "a habit tracker",
  "a portfolio site", "a support ticket system", "a team directory",
  "a content calendar", "a quiz app", "a weather dashboard",
  "an expense tracker", "a notes app", "a countdown timer",
  "a job board", "a meal planner", "a reading list",
  "a crypto tracker", "a travel planner", "a study planner",
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

// Break a long enhance response into paragraphs of N sentences each so it
// renders as readable blocks instead of a wall of text. Frontend-only —
// shared /api/enhance backend is unchanged.
function formatEnhancedAsParagraphs(text: string, sentencesPerParagraph = 3): string {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g);
  if (!sentences || sentences.length <= sentencesPerParagraph) return text.trim();
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(i, i + sentencesPerParagraph).join("").trim());
  }
  return paragraphs.join("\n\n");
}

export function LandingPage() {
  usePricingModal();
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [sphereScale, setSphereScale] = useState(1);
  const [fontSize, setFontSize] = useState(72);
  const [fontWeight, setFontWeight] = useState(700);
  const [hasText, setHasText] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [enhanceError, setEnhanceError] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [architecture, setArchitecture] = useState<"single" | "multi">("single");
  const [h1Height, setH1Height] = useState(0);

  const editableRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPromptRef = useRef<string | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  // Track the h1's rendered height so the toolbar can sit just below it
  // regardless of how many lines the typed text wraps to. Measure after
  // every layout commit — useLayoutEffect runs synchronously before paint,
  // so the toolbar's position lands in the same frame.
  useLayoutEffect(() => {
    if (!h1Ref.current) return;
    const newHeight = h1Ref.current.getBoundingClientRect().height;
    if (Math.abs(newHeight - h1Height) > 0.5) {
      setH1Height(newHeight);
    }
  });

  // Pick 3 random suggestions from the pool on each page mount
  const SUGGESTIONS = useMemo(() => {
    const pool = [...SUGGESTION_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, 3);
  }, []);
  const { session } = useAuth();
  const rafRef = useRef<number>(0);
  const currentSizeRef = useRef(72);
  const navigate = useNavigate();

  // After sign-in, check if there's a pending prompt and navigate to /plan
  useEffect(() => {
    if (session && pendingPromptRef.current) {
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      setShowAuthModal(false);
      navigate({ to: "/plan", search: { q: prompt } });
    }
  }, [session, navigate]);

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

  const handleSubmitPrompt = useCallback(
    (prompt: string) => {
      if (!session) {
        // Not signed in — show auth modal, preserve prompt
        pendingPromptRef.current = prompt;
        setAuthModalMode("signup");
        setShowAuthModal(true);
        return;
      }

      // Signed in — navigate to plan page
      navigate({ to: "/plan", search: { q: prompt } });
    },
    [session, navigate],
  );

  // When session appears after email sign-in, restore the pending prompt into the input
  useEffect(() => {
    if (session && pendingPromptRef.current) {
      const pending = pendingPromptRef.current;
      pendingPromptRef.current = null;
      setShowAuthModal(false);
      if (editableRef.current) {
        editableRef.current.textContent = pending;
        setHasText(true);
        updateFontSize();
        placeCursorAtEnd(editableRef.current);
      }
    }
  }, [session, updateFontSize]);

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

        if (!session) {
          // Not signed in — show auth overlay, keep prompt in input
          pendingPromptRef.current = prompt;
          setAuthModalMode("signup");
          setShowAuthModal(true);
          return;
        }

        if (!planMode) {
          saveProjectLaunchIntent({ prompt });
          navigate({ to: "/studio/project/$id", params: { id: "new" } });
        } else {
          handleSubmitPrompt(prompt);
        }

        // Signed in — always route through /plan
        navigate({ to: "/plan", search: { q: prompt } });
      }
    },
    [navigate, session, suggestionIndex, updateFontSize, planMode, handleSubmitPrompt],
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

    setEnhancing(true);

    try {
      const enhanced = await enhancePrompt(promptText);
      const formatted = formatEnhancedAsParagraphs(enhanced);

      el.textContent = "";
      updateFontSize();
      setIsTyping(true);
      const words = formatted.split(" ");
      let i = 0;
      const interval = setInterval(() => {
        if (i < words.length) {
          el.textContent += (i > 0 ? " " : "") + words[i];
          updateFontSize();
          i++;
        } else {
          clearInterval(interval);
          setEnhancing(false);
          setIsTyping(false);
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
      if (file) {
        setAttachedFiles((prev) =>
          prev.length < MAX_ATTACHMENTS ? [...prev, file] : prev,
        );
      }
      e.target.value = "";
    },
    [],
  );

  const removeAttachedFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const fileItems = Array.from(e.clipboardData.items).filter(
      (item) => item.kind === "file",
    );
    if (fileItems.length === 0) return;
    e.preventDefault();
    fileItems.forEach((item) => {
      const file = item.getAsFile();
      if (file) {
        setAttachedFiles((prev) =>
          prev.length < MAX_ATTACHMENTS ? [...prev, file] : prev,
        );
      }
    });
  }, []);

  useEffect(() => {
    editableRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!optionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        optionsRef.current?.contains(e.target as Node) ||
        optionsTriggerRef.current?.contains(e.target as Node)
      ) return;
      setOptionsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [optionsOpen]);

  useEffect(() => {
    if (!optionsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOptionsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [optionsOpen]);

  return (
    <div className="bg-bg" style={{ minHeight: "100vh" }}>
      {/* Marketing nav — replaces the old inline nav. Auth modal state is
          still managed here so Sign in / Get started callbacks keep working.
          Signed-in users see Dashboard + GlobalNav inside the sticky bar. */}
      {session ? (
        <nav className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4">
          <MyndlabLogo className="h-6 w-auto text-white" />
          <div className="flex items-center gap-6">
            <Link
              to="/studio/home"
              className="text-sm text-white/50 transition-colors hover:text-white/80"
            >
              Dashboard
            </Link>
            <GlobalNav variant="light" />
          </div>
        </nav>
      ) : (
        <MarketingNav
          onSignInClick={() => { setAuthModalMode("signin"); setShowAuthModal(true); }}
          onGetStartedClick={() => { setAuthModalMode("signup"); setShowAuthModal(true); }}
        />
      )}
      {/* Hero fills viewport minus nav height. When signed in the nav is
          absolute so the hero stays 100vh; when signed out the sticky nav
          consumes ~76px so the hero is adjusted to keep the Build prompt
          visually centred in the remaining space. */}
      <div className="relative" style={{ height: session ? "100vh" : "calc(100vh - 76px)" }}>

        {/* Hero section — children absolutely positioned so Build + glow can
            both sit at exact 50%/50% independent of one another. */}
        <section className="relative h-full overflow-x-hidden overflow-y-auto px-4 py-20">
          {/* Gradient sphere — exact section center. Subtle breathing pulse
              when the prompt is empty; steady once the user starts typing. */}
          <div
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] rounded-full blur-[120px] transition-transform duration-150",
              hasText ? "opacity-40" : "hero-glow-breathing",
            )}
            style={{
              background:
                "radial-gradient(circle, #00D5D8 0%, transparent 100%)",
              transform: `translate(-50%, -50%) scale(${sphereScale})`,
            }}
          />

          {/* Attachment pills — absolute, anchored to h1's top edge (16px gap
              above). translateY(-100%) flips the anchor so `top` represents
              the pills' BOTTOM edge. flex-nowrap keeps them on one row. */}
          {attachedFiles.length > 0 && (
            <div
              className="absolute left-1/2 z-10 flex max-w-[90vw] flex-nowrap justify-center gap-2 overflow-x-auto"
              style={{
                top: `calc(50% - ${h1Height / 2 - fontSize * 0.25 + 16}px)`,
                transform: "translate(-50%, -100%)",
              }}
            >
              {attachedFiles.map((file, i) => (
                <AttachmentPill
                  key={i}
                  file={file}
                  onRemove={() => removeAttachedFile(i)}
                />
              ))}
            </div>
          )}

          {/* Prompt headline — fully editable. Anchored at exact section
              midpoint. translateY compensates for the asymmetric paddingBottom
              on the inner span (= fontSize * 0.25, half the 0.5em padding)
              so the visible text glyph centers on 50%, not the box center. */}
          <h1
            ref={h1Ref}
            className="absolute left-1/2 top-1/2 z-10 w-full max-w-4xl overflow-hidden text-center font-sans text-white"
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: fontWeight,
              lineHeight: 1.4,
              maxHeight: "60vh",
              transition: "font-size 0.15s ease, transform 0.15s ease",
              transform: `translate(-50%, calc(-50% + ${fontSize * 0.25}px))`,
            }}
          >
            <span
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onPaste={handlePaste}
              data-placeholder="Build "
              className={cn(
                "outline-none caret-orange inline-block min-w-[1ch] text-center",
                !hasText &&
                  "before:content-[attr(data-placeholder)] before:text-white/30",
              )}
              style={{ paddingBottom: "0.5em", lineHeight: 1.4, whiteSpace: "pre-wrap" }}
            />
          </h1>

          {/* Typing toolbar — absolute. Toolbar's top tracks the h1's actual
              rendered bottom so it doesn't overlap multi-line text. Hidden
              while the enhance typewriter runs (h1 grows faster than the
              toolbar can track at 40ms/word). */}
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 flex items-center gap-3 transition-opacity duration-700 ease-in-out",
              optionsOpen ? "z-[60]" : "z-10",
              hasText && !isTyping ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            style={{
              // h1 box bottom (relative to 50%) = h1Height/2 + fontSize*0.25.
              // Add 16px gap below.
              top: `calc(50% + ${h1Height / 2 + fontSize * 0.25 + 16}px)`,
            }}
          >
            {/* Plan mode toggle */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setPlanMode(!planMode); }}
              title="Review the build plan before generating"
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all hover:bg-white/[0.08] hover:border-white/20",
                planMode
                  ? "border-[#00D5D8]/40 bg-[#00D5D8]/15 text-[#00D5D8]"
                  : "text-white/40",
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
                "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all hover:bg-white/[0.08] hover:border-white/20",
                enhanceError
                  ? "border-red-500/40 text-red-400"
                  : "text-white/40",
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
              onMouseDown={(e) => { e.preventDefault(); if (attachedFiles.length < MAX_ATTACHMENTS) fileInputRef.current?.click(); }}
              disabled={attachedFiles.length >= MAX_ATTACHMENTS}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all hover:bg-white/[0.08] hover:border-white/20",
                attachedFiles.length >= MAX_ATTACHMENTS
                  ? "text-white/20 cursor-not-allowed"
                  : "text-white/40",
              )}
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

            {/* Voice chat — Pro-gated */}
            <div className="relative group">
              <button
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Voice chat (Pro feature)"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all text-white/30 cursor-not-allowed"
              >
                <Mic size={14} />
              </button>
              <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1a1a]/95 px-3 py-1.5 text-xs text-white opacity-0 shadow-xl backdrop-blur-md transition-opacity group-hover:opacity-100 pointer-events-none">
                Voice chat is available on Pro and above
              </div>
            </div>

            {/* Options popover */}
            <div className="relative">
              <button
                ref={optionsTriggerRef}
                onMouseDown={(e) => { e.preventDefault(); setOptionsOpen(o => !o); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1 text-xs font-medium shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all hover:bg-white/[0.08] hover:border-white/20",
                  optionsOpen
                    ? "bg-white/[0.08] border-white/20 text-white/80"
                    : "text-white/60",
                )}
              >
                <SlidersHorizontal size={14} />
                Options · Next.js / Supabase
              </button>

              {optionsOpen && (
                <div
                  ref={optionsRef}
                  className="absolute right-0 bottom-full z-[60] mb-2 w-[380px] rounded-2xl border border-white/10 bg-[#0a0a0a]/90 p-5 shadow-2xl backdrop-blur-xl"
                >
                  {/* Architecture */}
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                      Architecture
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        onMouseDown={(e) => { e.preventDefault(); setArchitecture("single"); }}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all",
                          architecture === "single"
                            ? "border-[#00D5D8]/40 bg-[#00D5D8]/10"
                            : "border-white/10 bg-white/5",
                        )}
                      >
                        <p className="text-sm font-medium text-white/90">Single Architecture</p>
                        <p className="mt-0.5 text-xs text-white/50">Next.js + Supabase · Vercel-deployable</p>
                      </button>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3 opacity-50">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white/90">Multi Architecture</p>
                          <span className="rounded-full bg-[#00D5D8]/20 px-2 py-0.5 text-[10px] font-medium text-[#00D5D8]">Pro</span>
                        </div>
                        <p className="mt-0.5 text-xs text-white/50">Custom stacks · Python, Go, Rust &amp; more</p>
                        <a href="#" className="mt-1.5 inline-block text-xs text-[#00D5D8] underline">
                          Upgrade to Pro to unlock
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Technology Stack */}
                  <div className="mt-5">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                      Technology Stack
                    </p>
                    <div className="flex gap-2">
                      <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                        Next.js <span className="text-white/30">(required)</span>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                        Supabase <span className="text-white/30">(built-in)</span>
                      </div>
                    </div>
                  </div>

                  {/* Design DNA */}
                  <div className="mt-5">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                      Design DNA
                    </p>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:bg-white/[0.08]"
                    >
                      <Palette size={20} className="text-[#00D5D8]" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Suggestion strip + kbd hint — absolutely positioned ~80% down so
              the Build text + toolbar stay vertically centered without these
              pushing the centered stack up. */}
          <div className="absolute bottom-[15%] left-0 right-0 z-10 flex flex-col items-center px-4">
          <div className="flex flex-wrap justify-center gap-3">
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

          <p className="mt-4 text-sm text-white/30">
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
        </section>

        {/* Mini footer pinned to bottom of viewport */}
        <div className="absolute bottom-0 left-0 right-0 z-10 px-6 py-3 text-center">
          <p className="text-[11px] text-white/20">
            <Link to="/terms" className="transition-colors hover:text-white/40">Terms of Service</Link>
            {" · "}
            <Link to="/privacy" className="transition-colors hover:text-white/40">Privacy Policy</Link>
            {" · "}
            <Link to="/faq" className="transition-colors hover:text-white/40">FAQ</Link>
            {" · "}
            <Link to="/support" className="transition-colors hover:text-white/40">Support</Link>
            {" · "}
            <span>&copy; Myndlab 2026</span>
          </p>
        </div>
      </div>
      {/* Auth modal overlay */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => void navigate({ to: "/studio/home" })}
        pendingPrompt={pendingPromptRef.current ?? ""}
        initialMode={authModalMode}
      />
    </div>
  );
}
