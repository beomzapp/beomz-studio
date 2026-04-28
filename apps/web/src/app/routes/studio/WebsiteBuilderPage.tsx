/**
 * WebsiteBuilderPage — BEO-665
 * Full-screen website builder with floating command bar.
 * Route: /studio/websites/:projectId
 * No sidebar — StudioLayout bypasses this page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type { RefObject } from "react";
import {
  ChevronLeft,
  Clock,
  FileText,
  Globe,
  MousePointer2,
  Search,
  Send,
  X,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import { useWebContainerPreview } from "../../../hooks/useWebContainerPreview";
import { useWebsiteBuilder } from "../../../hooks/useWebsiteBuilder";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";
import { isWebContainerSupported } from "../../../lib/webcontainer";
import { GlobalNav } from "../../../components/layout/GlobalNav";
import { PublishModal } from "../../../components/builder";
import { useCredits } from "../../../lib/CreditsContext";

// ─── Section detection script ─────────────────────────────────────────────────
// BEO-682: Written to apps/web/src/beomz-detect.js in the WebContainer FS and
// imported from main.tsx so it runs inside the iframe's own JS bundle — no
// cross-origin eval() needed.

const DETECT_SCRIPT = `(function() {
  if (window.__beomzSectionDetection) return;
  window.__beomzSectionDetection = true;

  // BEO-681: inject styles — sections become relative, action bar floats top-right
  var style = document.createElement('style');
  style.textContent = [
    '[data-section]{position:relative!important;}',
    '[data-beomz-bar]{',
      'position:absolute;top:8px;right:8px;z-index:9999;',
      'display:flex;align-items:center;gap:2px;',
      'background:white;border-radius:9999px;padding:3px 6px;',
      'box-shadow:0 2px 10px rgba(0,0,0,0.14);',
      'opacity:0;pointer-events:none;',
      'transition:opacity 120ms ease;',
      'font-family:system-ui,sans-serif;',
    '}',
    '[data-beomz-bar].bz-show{opacity:1;pointer-events:auto;}',
    '[data-beomz-bar] button{',
      'border:none;background:transparent;cursor:pointer;',
      'font-size:11px;color:#374151;',
      'display:flex;align-items:center;gap:3px;',
      'padding:3px 7px;border-radius:6px;white-space:nowrap;',
    '}',
    '[data-beomz-bar] button:hover{background:#f3f4f6;}',
  ].join('');
  document.head.appendChild(style);

  // Click detection — skip clicks that originate inside the action bar
  document.addEventListener('click', function(e) {
    if (e.target.closest && e.target.closest('[data-beomz-bar]')) return;
    var el = e.target;
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.section) {
        window.parent.postMessage({ type: 'section-click', section: el.dataset.section }, '*');
        return;
      }
      el = el.parentElement;
    }
  });

  // BEO-681: build (or retrieve) the floating action bar for a section element
  function getOrCreateBar(sectionEl) {
    var bar = sectionEl.querySelector('[data-beomz-bar]');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.setAttribute('data-beomz-bar', '1');

    var editBtn = document.createElement('button');
    editBtn.innerHTML = '\u270f\ufe0f\u00a0Edit';
    editBtn.onclick = function(e) {
      e.stopPropagation();
      window.parent.postMessage({ type: 'section-click', section: sectionEl.dataset.section }, '*');
    };

    var reorderBtn = document.createElement('button');
    reorderBtn.textContent = '\u2195';
    reorderBtn.title = 'Reorder section';
    reorderBtn.onclick = function(e) {
      e.stopPropagation();
      window.parent.postMessage({ type: 'section-reorder', section: sectionEl.dataset.section }, '*');
    };

    bar.appendChild(editBtn);
    bar.appendChild(reorderBtn);
    sectionEl.appendChild(bar);
    return bar;
  }

  // Show action bar on mouseenter (mouseover + entering-from-outside check)
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.section) {
        if (!el.contains(e.relatedTarget)) {
          getOrCreateBar(el).classList.add('bz-show');
        }
        return;
      }
      el = el.parentElement;
    }
  });

  // Hide action bar on mouseleave (mouseout + leaving-to-outside check)
  document.addEventListener('mouseout', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.section) {
        if (!el.contains(e.relatedTarget)) {
          var bar = el.querySelector('[data-beomz-bar]');
          if (bar) bar.classList.remove('bz-show');
        }
        return;
      }
      el = el.parentElement;
    }
  });
})();`;

// ─── Section suggestions ─────────────────────────────────────────────────────

const SECTION_SUGGESTIONS: Record<string, string[]> = {
  hero: ["Make headline more punchy", "Change background colour", "Add social proof badge"],
  features: ["Add a 4th feature card", "Change to 2-column layout", "Make icons larger"],
  cta: ["Make CTA more urgent", "Change button colour", "Add guarantee line"],
  nav: ["Add a logo", "Change nav links", "Make nav sticky"],
  footer: ["Add social links", "Change footer colour", "Add newsletter signup"],
  about: ["Rewrite the about copy", "Add team photos", "Make it more personal"],
  default: ["Change the copy", "Adjust the colours", "Make it more minimal"],
};

function getSuggestions(section: string | null): string[] {
  if (!section) return SECTION_SUGGESTIONS.default;
  return SECTION_SUGGESTIONS[section.toLowerCase()] ?? SECTION_SUGGESTIONS.default;
}

// ─── Floating Command Bar ─────────────────────────────────────────────────────

interface FloatingCommandBarProps {
  activeSection: string | null;
  pickMode: boolean;
  onDeselect: () => void;
  onPickMode: () => void;
  onSend: (text: string) => void;
  isGenerating: boolean;
  onFocusRef: (el: HTMLInputElement | null) => void;
}

function FloatingCommandBar({
  activeSection,
  pickMode,
  onDeselect,
  onPickMode,
  onSend,
  isGenerating,
  onFocusRef,
}: FloatingCommandBarProps) {
  const [text, setText] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const hasSectionSelected = Boolean(activeSection);
  const isTyping = text.length > 0 && isFocused;
  const suggestions = getSuggestions(activeSection);

  const handleSend = useCallback(() => {
    const t = text.trim();
    if (!t || isGenerating) return;
    onSend(t);
    setText("");
  }, [text, isGenerating, onSend]);

  const handleSuggestion = useCallback(
    (s: string) => {
      onSend(s);
      setText("");
    },
    [onSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSend();
      if (e.key === "Escape") {
        setText("");
        onDeselect();
        (e.target as HTMLInputElement).blur();
      }
    },
    [handleSend, onDeselect],
  );

  const borderStyle = hasSectionSelected
    ? "border-[#F97316]"
    : "border-[#dddddd]";
  const borderWidth = hasSectionSelected ? "border" : "border-[0.5px]";

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-30">
      {/* Suggestion pills — visible when typing */}
      {isTyping && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {suggestions.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSuggestion(s);
              }}
              className="rounded-full border border-[#e5e5e5] bg-white/90 backdrop-blur px-3 py-1.5 text-[12px] text-[#374151] hover:border-[#F97316]/50 hover:bg-orange-50 transition-all shadow-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Command bar pill */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-[99px] bg-white/95 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] px-3 py-2.5",
          "min-w-[380px] max-w-[560px] w-full",
          borderWidth,
          borderStyle,
          "transition-all duration-150",
        )}
      >
        {/* MousePointer2 — leftmost; orange when section active or in pick mode */}
        <button
          onClick={hasSectionSelected ? onDeselect : onPickMode}
          title={
            hasSectionSelected
              ? `Editing: ${activeSection}`
              : "Click any section to edit it"
          }
          className="flex-shrink-0 rounded-md p-0.5 transition-colors hover:bg-[#f3f4f6]"
        >
          <MousePointer2
            size={14}
            style={{ color: hasSectionSelected || pickMode ? "#F97316" : "#9ca3af" }}
          />
        </button>

        {/* Divider */}
        <div className="h-4 w-px flex-shrink-0 bg-[#e5e5e5]" />

        {/* Spark icon */}
        <span className="text-[#F97316] flex-shrink-0 text-[18px] select-none">✦</span>

        {/* Section pill */}
        {hasSectionSelected && (
          <div className="flex items-center gap-1 rounded-full bg-[#FFF7ED] border border-[#F97316]/30 px-2.5 py-1 flex-shrink-0">
            <span className="text-[12px] font-medium text-[#F97316] capitalize">
              {activeSection} section
            </span>
            <button
              onClick={onDeselect}
              className="text-[#F97316]/60 hover:text-[#F97316] ml-0.5"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* Input */}
        <input
          ref={onFocusRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={
            isGenerating
              ? "Generating…"
              : hasSectionSelected
              ? "Describe what to change…"
              : "Ask Beomz to change anything… or click a section"
          }
          disabled={isGenerating}
          className="flex-1 bg-transparent text-[13px] text-[#1a1a1a] placeholder-[#9ca3af] outline-none min-w-0"
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || isGenerating}
          className={cn(
            "flex-shrink-0 rounded-full p-1.5 transition-colors",
            text.trim() && !isGenerating
              ? "bg-[#F97316] text-white hover:bg-[#EA580C]"
              : "bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed",
          )}
        >
          {isGenerating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── History drawer ───────────────────────────────────────────────────────────

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  history: Array<{ role: string; content: string; timestamp: string }>;
}

function HistoryDrawer({ open, onClose, history }: HistoryDrawerProps) {
  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 bg-white border-t border-[#e5e5e5] z-40 transition-transform duration-300",
        "h-[40%]",
        open ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
        <span className="text-[13px] font-semibold text-[#1a1a1a]">History</span>
        <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a1a]">
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto h-full pb-12 px-4 py-3 space-y-3">
        {history.length === 0 && (
          <p className="text-[13px] text-[#9ca3af] text-center mt-8">No history yet</p>
        )}
        {history.map((entry, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl px-3 py-2 text-[13px]",
              entry.role === "user"
                ? "bg-[#F97316]/10 text-[#1a1a1a] ml-8"
                : "bg-[#f3f4f6] text-[#374151] mr-8",
            )}
          >
            {entry.content}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pages panel ─────────────────────────────────────────────────────────────

interface PagesPanelProps {
  open: boolean;
  onClose: () => void;
  onAddPage: (page: string) => void;
}

function PagesPanel({ open, onClose, onAddPage }: PagesPanelProps) {
  return (
    <div
      className={cn(
        "absolute top-0 right-0 bottom-0 w-[260px] bg-white border-l border-[#e5e5e5] z-40 transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
        <span className="text-[13px] font-semibold text-[#1a1a1a]">Pages</span>
        <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a1a]">
          <X size={16} />
        </button>
      </div>
      <div className="px-4 py-3 space-y-1">
        <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-[#F97316]/10">
          <span className="text-[13px] font-medium text-[#F97316]">Home</span>
          <ChevronRight size={14} className="text-[#F97316]" />
        </div>
      </div>
      <button
        onClick={() => {
          const page = prompt("Page name (e.g. About):");
          if (page?.trim()) onAddPage(page.trim());
        }}
        className="mx-4 mt-2 w-[calc(100%-2rem)] rounded-lg border border-dashed border-[#e5e5e5] py-2 text-[12px] text-[#9ca3af] hover:border-[#F97316]/40 hover:text-[#F97316] transition-colors"
      >
        + Add page
      </button>
    </div>
  );
}

// ─── SEO panel ───────────────────────────────────────────────────────────────

interface SEOPanelProps {
  open: boolean;
  onClose: () => void;
  files: readonly { path: string; content: string }[] | null;
  onSave: (title: string, description: string) => void;
}

function SEOPanel({ open, onClose, files, onSave }: SEOPanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Pre-fill from index.html
  useEffect(() => {
    if (!files) return;
    const indexHtml = files.find((f) => f.path === "index.html");
    if (!indexHtml) return;
    const titleMatch = indexHtml.content.match(/<title>([^<]+)<\/title>/);
    const descMatch = indexHtml.content.match(/name="description"\s+content="([^"]+)"/);
    if (titleMatch?.[1]) setTitle(titleMatch[1]);
    if (descMatch?.[1]) setDescription(descMatch[1]);
  }, [files, open]);

  return (
    <div
      className={cn(
        "absolute top-0 right-0 bottom-0 w-[320px] bg-white border-l border-[#e5e5e5] z-40 transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
        <span className="text-[13px] font-semibold text-[#1a1a1a]">SEO</span>
        <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a1a]">
          <X size={16} />
        </button>
      </div>
      <div className="px-4 py-4 space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[#374151] mb-1.5">Meta title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder="Page title for search engines"
            className="w-full rounded-xl border border-[#e5e5e5] px-3 py-2 text-[13px] text-[#1a1a1a] outline-none focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10 transition-colors"
          />
          <p className="text-[11px] text-[#9ca3af] mt-1">{title.length}/60</p>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#374151] mb-1.5">Meta description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 160))}
            rows={4}
            placeholder="Brief description for search results"
            className="w-full resize-none rounded-xl border border-[#e5e5e5] px-3 py-2 text-[13px] text-[#1a1a1a] outline-none focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10 transition-colors"
          />
          <p className="text-[11px] text-[#9ca3af] mt-1">{description.length}/160</p>
        </div>
        <button
          onClick={() => onSave(title, description)}
          className="w-full rounded-xl bg-[#F97316] py-2.5 text-[13px] font-semibold text-white hover:bg-[#EA580C] transition-colors"
        >
          Save SEO
        </button>
      </div>
    </div>
  );
}

// ─── WebContainer loading overlay ─────────────────────────────────────────────

interface PreviewOverlayProps {
  message: string;
}

function PreviewOverlay({ message }: PreviewOverlayProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#faf9f6] z-10">
      <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#F97316]/20" />
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F97316]">
          <BeomzLogo className="h-7 w-7 text-white" />
        </span>
      </div>
      <p className="max-w-[480px] text-center text-[14px] font-medium text-[#1a1a1a]">
        {((message || "Loading…").length > 80
          ? (message || "Loading…").slice(0, 80) + "…"
          : (message || "Loading…"))}
      </p>
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

interface WebsiteTopBarProps {
  siteName: string;
  projectId: string;
  onSiteNameChange: (name: string) => void;
  onHistoryClick: () => void;
  onPagesClick: () => void;
  onSEOClick: () => void;
  onPublish: () => void;
}

function WebsiteTopBar({
  siteName,
  projectId,
  onSiteNameChange,
  onHistoryClick,
  onPagesClick,
  onSEOClick,
  onPublish,
}: WebsiteTopBarProps) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(siteName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(siteName);
  }, [siteName]);

  const commit = () => {
    setEditing(false);
    const name = draft.trim() || siteName;
    setDraft(name);
    onSiteNameChange(name);
  };

  const slug = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || projectId.slice(0, 8);

  return (
    <header className="relative z-[60] flex h-12 flex-none shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-3">
      {/* Left */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/* Back button — exact copy from TopBar */}
        <button
          onClick={() => navigate({ to: "/studio/websites" })}
          className="flex flex-none items-center gap-1 rounded-md px-2 py-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Logo — dark, matching ProjectPage TopBar style */}
        <BeomzLogo className="h-5 w-5 flex-shrink-0 text-[#1a1a1a]" />

        <span className="select-none text-[14px] text-[#e5e5e5]">·</span>

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(siteName);
                setEditing(false);
              }
            }}
            autoFocus
            className="min-w-[80px] max-w-[200px] border-b border-[#1a1a1a] bg-transparent text-sm font-semibold text-[#1a1a1a] outline-none"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="max-w-[220px] truncate text-sm font-semibold text-[#1a1a1a] transition-colors hover:text-[#6b7280]"
          >
            {siteName || "Untitled Site"}
          </button>
        )}
        <span className="flex-shrink-0 rounded-full border border-[#e5e5e5] bg-[#faf9f6] px-2 py-0.5 font-mono text-[11px] text-[#9ca3af]">
          {slug}.beomz.app
        </span>
      </div>

      {/* Right */}
      <div className="flex flex-1 items-center justify-end gap-1.5">
        <button
          onClick={onHistoryClick}
          title="History"
          className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
        >
          <Clock size={16} />
        </button>
        <button
          onClick={onPagesClick}
          title="Pages"
          className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
        >
          <FileText size={16} />
        </button>
        <button
          onClick={onSEOClick}
          title="SEO"
          className="rounded-md p-1.5 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
        >
          <Search size={16} />
        </button>

        <div className="h-4 w-px bg-[#e5e5e5]" />

        {/* Publish button — exact copy from TopBar (dark style) */}
        <button
          onClick={onPublish}
          className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#333]"
        >
          <Globe size={12} />
          Publish
        </button>

        <div className="h-4 w-px bg-[#e5e5e5]" />

        {/* Credits + avatar — same pattern as ProjectPage TopBar via GlobalNav */}
        <GlobalNav />
      </div>
    </header>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WebsiteBuilderPage() {
  const { projectId } = useParams({ from: "/studio/websites/$projectId" });
  const search = useSearch({ from: "/studio/websites/$projectId" }) as { brief?: string };
  const brief = typeof search.brief === "string" ? decodeURIComponent(search.brief) : null;

  const { credits } = useCredits();

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("My Website");
  const [pickMode, setPickMode] = useState(false);

  // Panels
  const [showHistory, setShowHistory] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [showSEO, setShowSEO] = useState(false);

  // Publish modal
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [beomzAppUrl, setBeomzAppUrl] = useState<string | null>(null);

  const commandBarInputRef = useRef<HTMLInputElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // BEO-676: ref to patchFile from useWebContainerPreview — set below after
  // useWebContainerPreview is called, read by useWebsiteBuilder SSE handler.
  const wcPatchFileRef = useRef<((file: string, content: string) => Promise<void>) | null>(null);

  // Website builder SSE + files
  const {
    files,
    buildId,
    siteName: generatedSiteName,
    status: buildStatus,
    statusMessage,
    history,
    sendIterate,
    isBuildInProgress,
    lastIterationAt,
  } = useWebsiteBuilder(projectId, brief, wcPatchFileRef as RefObject<((file: string, content: string) => Promise<void>) | null>);

  // Update site name from generated content
  useEffect(() => {
    if (generatedSiteName) setSiteName(generatedSiteName);
  }, [generatedSiteName]);

  // WebContainer preview
  // BEO-671: Gate files delivery — only pass files after the build completes.
  // Files arrive mid-stream while isBuildInProgress=true. deliverFiles() defers
  // with pendingDeliverRef=true, but server-ready fires exactly once (during boot)
  // and also defers. When the build finishes, `files` reference hasn't changed so
  // the files-change effect never re-runs and the overlay is stuck permanently.
  // Passing null while building ensures `wcFiles` transitions null→files at the
  // same moment isBuildInProgress flips to false, giving the files-change effect
  // a new reference and allowing delivery to proceed.
  const wcFiles = isBuildInProgress ? null : files;
  const wcProject = { id: projectId, name: siteName, templateId: "marketing-website" as const };
  const {
    status: wcStatus,
    previewUrl,
    progressMessage,
    firstFilesDelivered,
    isHotPatching,
    patchFile,
    wcInstanceRef,
  } = useWebContainerPreview(
    wcFiles,
    wcProject,
    undefined,
    undefined,
    buildId,
    undefined,
    undefined,
    isBuildInProgress,
  );

  // BEO-676: keep the ref current so useWebsiteBuilder's SSE handler can call it.
  wcPatchFileRef.current = patchFile;

  const showOverlay =
    !isWebContainerSupported() ||
    wcStatus === "booting" ||
    wcStatus === "installing" ||
    wcStatus === "starting" ||
    !firstFilesDelivered ||
    isHotPatching ||
    buildStatus === "generating";

  const overlayMessage = buildStatus === "generating"
    ? statusMessage || "Building your website…"
    : wcStatus === "installing"
    ? "Installing packages…"
    : wcStatus === "starting"
    ? "Starting preview…"
    : progressMessage;

  // Section click detection + BEO-681 reorder via postMessage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "section-click" && typeof e.data.section === "string") {
        setActiveSection(e.data.section);
        setPickMode(false);
      }
      // BEO-681: reorder button in hover bar — pre-fill command bar so user can type "up" / "down"
      if (e.data?.type === "section-reorder" && typeof e.data.section === "string") {
        const inputEl = commandBarInputRef.current;
        if (inputEl) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(inputEl, `Move the ${e.data.section} section `);
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          }
          inputEl.focus();
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // BEO-687: After the first successful generate, strip ?brief= from the URL
  // so future page refreshes do not re-trigger the generate call.
  const briefClearedRef = useRef(false);
  useEffect(() => {
    if (!briefClearedRef.current && brief && buildStatus === "done") {
      briefClearedRef.current = true;
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [buildStatus, brief]);

  // BEO-682: inject section detection by writing a JS file to the WebContainer FS
  // and prepending its import to main.tsx — avoids cross-origin eval() entirely.
  const injectSectionDetection = useCallback(async () => {
    const wc = wcInstanceRef.current?.wc;
    if (!wc) return;
    await wc.fs.writeFile('apps/web/src/beomz-detect.js', DETECT_SCRIPT);
    try {
      const main = await wc.fs.readFile('apps/web/src/main.tsx', 'utf-8');
      if (!main.includes('beomz-detect')) {
        await wc.fs.writeFile('apps/web/src/main.tsx', `import './beomz-detect.js'\n${main}`);
      }
    } catch { /* ignore */ }
  }, []);

  // BEO-682: inject after firstFilesDelivered — iframe onLoad fires too early
  // (blank Vite dev server), so we wait until the built website is ready.
  useEffect(() => {
    if (!firstFilesDelivered) return;
    const timer = setTimeout(injectSectionDetection, 1000);
    return () => clearTimeout(timer);
  }, [firstFilesDelivered, injectSectionDetection]);

  // BEO-682: re-inject after each iteration so new [data-section] elements are wired up.
  useEffect(() => {
    if (!lastIterationAt) return;
    const timer = setTimeout(injectSectionDetection, 2000);
    return () => clearTimeout(timer);
  }, [lastIterationAt, injectSectionDetection]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey && e.key === "k") || e.key === "/") {
        e.preventDefault();
        commandBarInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setActiveSection(null);
        setPickMode(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      sendIterate(text, activeSection ?? undefined);
    },
    [sendIterate, activeSection],
  );

  const handleAddPage = useCallback(
    (page: string) => {
      setShowPages(false);
      sendIterate(`Add a ${page} page to the navigation`);
    },
    [sendIterate],
  );

  const handleSEOSave = useCallback(
    async (title: string, description: string) => {
      // Update the index.html via the command bar
      sendIterate(
        `Update the meta title to "${title}" and meta description to "${description}" in index.html`,
      );
      setShowSEO(false);
    },
    [sendIterate],
  );

  const handlePublish = useCallback(() => {
    setShowPublishModal(true);
  }, []);

  const isWcFallback = !isWebContainerSupported();

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#faf9f6]">
      {/* Top bar */}
      <WebsiteTopBar
        siteName={siteName}
        projectId={projectId}
        onSiteNameChange={setSiteName}
        onHistoryClick={() => {
          setShowHistory((v) => !v);
          setShowPages(false);
          setShowSEO(false);
        }}
        onPagesClick={() => {
          setShowPages((v) => !v);
          setShowHistory(false);
          setShowSEO(false);
        }}
        onSEOClick={() => {
          setShowSEO((v) => !v);
          setShowHistory(false);
          setShowPages(false);
        }}
        onPublish={handlePublish}
      />

      {/* Preview area */}
      <div className={cn("relative flex-1 overflow-hidden", pickMode && "cursor-crosshair")}>
        {/* WebContainer iframe */}
        {!isWcFallback && previewUrl && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="absolute inset-0 h-full w-full border-0"
            allow="cross-origin-isolated"
            title="Website preview"
          />
        )}

        {/* Fallback: WebContainer not supported */}
        {isWcFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#faf9f6]">
            <p className="text-[14px] text-[#9ca3af] text-center px-8">
              Live preview requires a browser that supports SharedArrayBuffer
              (Chrome / Edge 92+).
            </p>
          </div>
        )}

        {/* Loading overlay */}
        {!isWcFallback && showOverlay && (
          <PreviewOverlay message={overlayMessage} />
        )}

        {/* Floating command bar */}
        <FloatingCommandBar
          activeSection={activeSection}
          pickMode={pickMode}
          onDeselect={() => {
            setActiveSection(null);
            setPickMode(false);
          }}
          onPickMode={() => setPickMode(true)}
          onSend={handleSend}
          isGenerating={isBuildInProgress}
          onFocusRef={(el) => {
            commandBarInputRef.current = el;
          }}
        />

        {/* Side panels */}
        <PagesPanel
          open={showPages}
          onClose={() => setShowPages(false)}
          onAddPage={handleAddPage}
        />
        <SEOPanel
          open={showSEO}
          onClose={() => setShowSEO(false)}
          files={files}
          onSave={handleSEOSave}
        />

        {/* History drawer */}
        <HistoryDrawer
          open={showHistory}
          onClose={() => setShowHistory(false)}
          history={history}
        />
      </div>

      {showPublishModal && (
        <PublishModal
          projectId={projectId}
          beomzAppUrl={beomzAppUrl}
          plan={credits?.plan ?? "free"}
          onClose={() => setShowPublishModal(false)}
          onVercelDeployed={(url) => setBeomzAppUrl(url)}
          onVercelUnpublished={() => setBeomzAppUrl(null)}
        />
      )}
    </div>
  );
}
