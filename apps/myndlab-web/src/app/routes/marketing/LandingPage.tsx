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
  ArrowUp,
  Gift,
  Globe,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "../../../lib/theme";
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

// ─────────────────────────────────────────────────────────────────────────────
// SignedInNav — mirrors MarketingNav exactly: same positioning, gaps, spacing,
// text vocab, theme awareness. Only the menu links and right-cluster items
// differ (Projects/Templates/etc. + Invite + credits/avatar via GlobalNav).
// ─────────────────────────────────────────────────────────────────────────────
function SignedInNav() {
  const { theme, toggleTheme, lang, toggleLang } = useTheme();

  const linkStyle = { color: "var(--myndlab-fg-muted)" } as const;
  const onLinkEnter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-hover)";
  };
  const onLinkLeave = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.color = "var(--myndlab-fg-muted)";
  };

  return (
    <nav className="absolute left-0 right-0 top-0 z-20">
      <div className="flex items-center gap-8 px-6 py-4">
        {/* Logo — left */}
        <Link to="/" className="flex items-center" style={{ color: "var(--myndlab-fg)" }}>
          <MyndlabLogo className="h-6 w-auto" />
        </Link>

        {/* Studio nav — left, immediately after logo */}
        <div className="flex items-center gap-6">
          <Link to="/studio/home" className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Projects
          </Link>
          <Link to={"/studio/templates" as "/"} className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Templates
          </Link>
          <Link to="/pricing" className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Pricing
          </Link>
          <Link to="/guide" className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Guide
          </Link>
          <Link to="/faq" className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            FAQs
          </Link>
          <Link to={"/admin" as "/"} className="text-sm transition-colors" style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Admin
          </Link>
        </div>

        {/* Right cluster — Invite, language, theme, Credits+Avatar (GlobalNav) */}
        <div className="ml-auto flex items-center gap-3">
          <Link
            to={"/studio/invite" as "/"}
            className="inline-flex items-center gap-1.5 text-sm transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            <Gift size={14} />
            <span>Invite</span>
          </Link>

          <button
            type="button"
            onClick={toggleLang}
            aria-label={lang === "en" ? "Switch to Arabic" : "Switch to English"}
            title={lang === "en" ? "Switch to Arabic" : "Switch to English"}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            <Globe size={14} />
            <span className="font-medium tracking-wide">{lang === "en" ? "EN" : "ع"}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="inline-flex items-center justify-center rounded-full p-2 transition-colors"
            style={linkStyle}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* GlobalNav renders the plan badge + credit pill + user avatar dropdown */}
          <GlobalNav variant="light" />
        </div>
      </div>
    </nav>
  );
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
    <div className="marketing-surface" style={{ minHeight: "100vh", background: "var(--myndlab-surface)", color: "var(--myndlab-fg)" }}>
      {/* Marketing nav — replaces the old inline nav. Auth modal state is
          still managed here so Sign in / Get started callbacks keep working.
          Signed-in users see Dashboard + GlobalNav inside the sticky bar. */}
      {session ? (
        <SignedInNav />
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
              background: "var(--myndlab-glow)",
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
            className="absolute left-1/2 top-1/2 z-10 w-full max-w-4xl overflow-hidden text-center font-sans"
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

            {/* Submit — solid cyan circular icon button, sends current prompt */}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const text = editableRef.current?.textContent?.trim();
                if (text) handleSubmitPrompt(text);
              }}
              disabled={!hasText}
              aria-label="Submit prompt"
              title="Submit (Enter)"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00D5D8] text-[#131313] transition-all hover:bg-[#00BCC0] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
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

        {/* Footer pinned flush to viewport bottom (fixed, not absolute, so it
            hugs the true bottom edge regardless of hero wrapper height). */}
        <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-between gap-4 px-6 pb-4 pt-3 text-[11px] text-white/30">
          {/* Left — social icons */}
          <div className="flex items-center gap-3">
            <a href="https://reddit.com" target="_blank" rel="noopener noreferrer" aria-label="Reddit" className="transition-colors hover:text-white/70">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="currentColor"><path d="M22 11.816c0-1.256-1.021-2.277-2.277-2.277-.593 0-1.122.24-1.526.613-1.481-.965-3.455-1.594-5.647-1.69l1.171-3.702 3.18.748-.011.15a1.78 1.78 0 0 0 1.776 1.776 1.78 1.78 0 0 0 1.776-1.776 1.78 1.78 0 0 0-1.776-1.776c-.749 0-1.392.469-1.65 1.131l-3.471-.817a.336.336 0 0 0-.391.224l-1.302 4.115c-2.246.075-4.272.708-5.781 1.685a2.276 2.276 0 0 0-1.526-.613A2.28 2.28 0 0 0 2 11.815c0 .894.518 1.665 1.27 2.038-.027.182-.043.366-.043.553 0 3.149 3.939 5.708 8.773 5.708s8.773-2.559 8.773-5.708c0-.181-.014-.36-.04-.536A2.276 2.276 0 0 0 22 11.816zm-3.776-5.99a1.07 1.07 0 0 1 0 2.141 1.07 1.07 0 0 1 0-2.141zM7.105 13.4a1.234 1.234 0 1 1 2.468.001 1.234 1.234 0 0 1-2.468-.001zM12 18.2c-1.564 0-2.823-.547-2.823-1.215 0-.222.179-.4.4-.4.087 0 .169.027.235.07.604.396 1.346.65 2.188.65.846 0 1.586-.254 2.19-.65a.434.434 0 0 1 .235-.07.4.4 0 0 1 .4.4c0 .668-1.26 1.215-2.825 1.215zm2.91-3.565a1.234 1.234 0 1 1 0-2.467 1.234 1.234 0 0 1 0 2.467z"/></svg>
            </a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" aria-label="Discord" className="transition-colors hover:text-white/70">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            </a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" className="transition-colors hover:text-white/70">
              <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="transition-colors hover:text-white/70">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="transition-colors hover:text-white/70">
              <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="transition-colors hover:text-white/70">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            </a>
          </div>

          {/* Center — legal + copyright */}
          <p className="flex items-center gap-2 text-[11px] text-white/30">
            <Link to="/terms" className="transition-colors hover:text-white/60">Terms of Service</Link>
            <span>·</span>
            <Link to="/privacy" className="transition-colors hover:text-white/60">Privacy Policy</Link>
            <span>·</span>
            <Link to="/faq" className="transition-colors hover:text-white/60">FAQ</Link>
            <span>·</span>
            <Link to="/support" className="transition-colors hover:text-white/60">Support</Link>
            <span>·</span>
            <span>&copy; Myndlab 2026</span>
          </p>

          {/* Right — Powered by Permus (icon-only SVG + text, both inherit
              currentColor from the parent link so they match the footer). */}
          <a
            href="https://permus.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-white/70"
          >
            <span className="text-[11px]">Powered by</span>
            <svg
              viewBox="0 0 145 155"
              fill="currentColor"
              aria-label="Permus"
              className="h-3.5 w-auto"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M24.8767 70.5108L88.9781 24.251L95.0601 19.8594C95.7313 19.3742 96.0938 18.6668 96.0938 17.8436C96.0938 17.0204 95.7313 16.313 95.0601 15.8278L88.9781 11.4394L75.3769 1.62336L73.7887 0.477742C72.8937 -0.16706 71.7339 -0.16706 70.8421 0.477742L69.2538 1.62336L1.03367 50.86C0.362438 51.3451 0 52.0526 0 52.8758V107.631C0 108.592 0.507294 109.415 1.36769 109.85C2.22808 110.285 3.19856 110.21 3.98007 109.647L10.4467 104.98L104.171 37.341C105.066 36.6963 106.225 36.6963 107.117 37.341C113.864 42.2116 120.612 47.0788 127.356 51.9493L130.094 53.9244L10.4499 140.269L1.03367 147.064C0.362438 147.549 0 148.256 0 149.08V152.513C0 153.884 1.12507 155.002 2.50528 155.002H40.2931C40.8445 155.002 41.3204 154.849 41.7679 154.526L55.4919 144.622L69.8746 134.243L130.203 90.7064C130.986 90.1429 131.954 90.0678 132.816 90.5029C133.677 90.9379 134.183 91.7612 134.183 92.722V152.51C134.183 153.881 135.31 154.999 136.689 154.999H142.125C143.507 154.999 144.631 153.881 144.631 152.51V72.3701C144.631 71.4093 144.122 70.586 143.262 70.1508C142.404 69.7157 141.432 69.791 140.651 70.3543L134.183 75.0213L114.863 88.966L38.4022 144.143C37.9547 144.466 37.482 144.619 36.9274 144.619H29.8841C28.7781 144.619 27.842 143.943 27.4987 142.898C27.1583 141.855 27.5144 140.76 28.4093 140.112L134.183 63.7779L143.6 56.9825C144.272 56.4974 144.633 55.7899 144.633 54.9667V52.8665C144.633 52.0432 144.272 51.3357 143.6 50.8507L138.97 47.5108C130.821 41.6294 122.668 35.7478 114.52 29.8663L107.117 24.5264C106.222 23.8816 105.063 23.8816 104.171 24.5264L96.7682 29.8663L14.43 89.2914C13.6485 89.855 12.681 89.93 11.8176 89.495C10.9572 89.0599 10.4499 88.2367 10.4499 87.2756V58.1407C10.4499 57.3175 10.8122 56.61 11.4834 56.1249L70.8421 13.2924C71.7371 12.6476 72.8967 12.6476 73.7887 13.2924L77.3117 15.8341C77.983 16.3192 78.3454 17.0266 78.3454 17.8467C78.3454 18.6668 77.983 19.3773 77.3117 19.8625L21.9301 59.8309C21.2589 60.3162 20.8965 61.0234 20.8965 61.8467V68.5013C20.8965 69.4622 21.404 70.2854 22.2642 70.7204C23.1246 71.1557 24.0952 71.0804 24.8767 70.5171V70.5108ZM113.284 131.852V136.938C113.284 137.761 112.922 138.469 112.251 138.954L104.395 144.622L96.2545 150.498C95.3596 151.142 95.0035 152.238 95.3439 153.284C95.6841 154.326 96.6233 155.005 97.7293 155.005H106.95C107.502 155.005 107.978 154.852 108.425 154.529L122.146 144.626L122.7 144.225C123.372 143.74 123.733 143.032 123.733 142.209V111.506C123.733 110.545 123.227 109.722 122.366 109.287C121.506 108.851 120.536 108.927 119.753 109.49L71.069 144.622L62.929 150.498C62.0341 151.142 61.678 152.238 62.0184 153.284C62.3588 154.326 63.2978 155.005 64.4009 155.005H73.6184C74.17 155.005 74.6457 154.852 75.0932 154.529L88.8174 144.626L109.304 129.842C110.086 129.279 111.053 129.204 111.917 129.639C112.777 130.074 113.284 130.897 113.284 131.858V131.852ZM10.4499 116.217L1.03367 123.012C0.362438 123.497 0 124.205 0 125.028V131.683C0 132.643 0.507294 133.467 1.36769 133.902C2.22808 134.337 3.19856 134.262 3.98007 133.698L10.4499 129.031L110.637 56.7289C111.308 56.2438 111.671 55.5363 111.671 54.7131C111.671 53.8899 111.308 53.1826 110.637 52.7005L106.027 49.3732C105.132 48.7284 103.972 48.7284 103.08 49.3732L10.4499 116.217Z"
              />
            </svg>
            <span className="text-[11px] font-semibold tracking-wide">Permus</span>
          </a>
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
