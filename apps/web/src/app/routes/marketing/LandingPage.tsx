import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  ListChecks,
  Sparkles,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import { useAuth } from "../../../lib/useAuth";
import { saveProjectLaunchIntent } from "../../../lib/projectLaunchIntent";
import { GlobalNav } from "../../../components/layout/GlobalNav";
import { AuthModal } from "../../../components/auth/AuthModal";
import { usePricingModal } from "../../../contexts/PricingModalContext";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";
import { enhancePrompt } from "../../../lib/api";

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

export function LandingPage() {
  const { openPricingModal } = usePricingModal();
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [sphereScale, setSphereScale] = useState(1);
  const [fontSize, setFontSize] = useState(72);
  const [fontWeight, setFontWeight] = useState(700);
  const [hasText, setHasText] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const editableRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPromptRef = useRef<string | null>(null);

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

  useEffect(() => {
    editableRef.current?.focus();
  }, []);

  return (
    <div className="h-screen bg-bg">
      <div className="relative h-screen">
        {/* Top nav */}
        <nav className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4">
          <BeomzLogo className="h-6 w-auto text-white" />
          <div className="flex items-center gap-6">
            {!session && (
              <button
                type="button"
                onClick={openPricingModal}
                className="text-sm text-white/50 transition-colors hover:text-white/80"
              >
                Pricing
              </button>
            )}
            {session ? (
              <>
                <Link
                  to="/studio/home"
                  className="text-sm text-white/50 transition-colors hover:text-white/80"
                >
                  Dashboard
                </Link>
                <GlobalNav variant="light" />
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="text-sm text-white/50 transition-colors hover:text-white/80"
                >
                  Sign in
                </button>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="text-sm text-white/30 transition-colors hover:text-white/50"
                >
                  Get started
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Hero section */}
        <section className="relative flex h-full flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-20">
          {/* Gradient sphere */}
          <div
            className="pointer-events-none absolute h-[500px] w-[500px] rounded-full opacity-40 blur-[120px] transition-transform duration-150"
            style={{
              background:
                "radial-gradient(circle, var(--color-orange) 0%, var(--color-purple) 60%, transparent 100%)",
              transform: `scale(${sphereScale})`,
            }}
          />

          {/* Attachment pills */}
          {attachedFiles.length > 0 && (
            <div className="relative z-10 mb-4 flex max-w-2xl flex-wrap justify-center gap-2">
              {attachedFiles.map((file, i) => (
                <AttachmentPill
                  key={i}
                  file={file}
                  onRemove={() => removeAttachedFile(i)}
                />
              ))}
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
            {/* Plan mode toggle */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setPlanMode(!planMode); }}
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
              onMouseDown={(e) => { e.preventDefault(); if (attachedFiles.length < MAX_ATTACHMENTS) fileInputRef.current?.click(); }}
              disabled={attachedFiles.length >= MAX_ATTACHMENTS}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                attachedFiles.length >= MAX_ATTACHMENTS
                  ? "border-border text-white/20 cursor-not-allowed"
                  : "border-border text-white/40 hover:border-white/20 hover:text-white/60",
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
            <span>&copy; Beomz 2026</span>
          </p>
        </div>
      </div>
      {/* Auth modal overlay */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        pendingPrompt={pendingPromptRef.current ?? ""}
      />
    </div>
  );
}
