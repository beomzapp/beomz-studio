/**
 * StylePanel — BEO-689
 * Lovable-style click-to-edit panel for individual elements.
 *
 * Slides in from the right (260px) when an element is clicked in the preview.
 * Four tabs (Text · Colors · Spacing · Advanced) read the current Tailwind
 * classes off the element, let the user tweak them visually, then on Apply
 * reconstruct the className and emit it via onApply(newClassName, newContent?).
 *
 * The parent (WebsiteBuilderPage) is responsible for converting the result
 * into an iterate prompt and sending it to /api/websites/iterate.
 */

import { useEffect, useMemo, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, X } from "lucide-react";
import { cn } from "../../lib/cn";

export interface StylePanelElement {
  tagName: string;
  className: string;
  textContent: string;
  sectionName?: string | null;
}

interface StylePanelProps {
  element: StylePanelElement;
  onApply: (newClassName: string, newContent?: string) => void;
  onClose: () => void;
}

type TabKey = "text" | "colors" | "spacing" | "advanced";

// ─── Tailwind token sets ─────────────────────────────────────────────────────

const FONT_SIZES = [
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
] as const;

const FONT_WEIGHTS = [
  "font-normal",
  "font-medium",
  "font-semibold",
  "font-bold",
] as const;

const TEXT_ALIGNS = ["text-left", "text-center", "text-right"] as const;

const PADDINGS = [
  "p-0",
  "p-1",
  "p-2",
  "p-3",
  "p-4",
  "p-6",
  "p-8",
] as const;

const TEXT_COLOR_SWATCHES: { value: string; bg: string; label: string }[] = [
  { value: "text-white", bg: "#ffffff", label: "white" },
  { value: "text-black", bg: "#000000", label: "black" },
  { value: "text-gray-900", bg: "#111827", label: "gray-900" },
  { value: "text-gray-500", bg: "#6b7280", label: "gray-500" },
  { value: "text-orange-500", bg: "#f97316", label: "orange-500" },
  { value: "text-[#F97316]", bg: "#F97316", label: "#F97316" },
];

const BG_COLOR_SWATCHES: { value: string; bg: string; label: string }[] = [
  { value: "bg-white", bg: "#ffffff", label: "white" },
  { value: "bg-black", bg: "#000000", label: "black" },
  { value: "bg-gray-900", bg: "#111827", label: "gray-900" },
  { value: "bg-gray-500", bg: "#6b7280", label: "gray-500" },
  { value: "bg-orange-500", bg: "#f97316", label: "orange-500" },
  { value: "bg-[#F97316]", bg: "#F97316", label: "#F97316" },
];

// ─── Token helpers ───────────────────────────────────────────────────────────

function tokenize(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function findOne(tokens: string[], candidates: readonly string[]): string | null {
  return tokens.find((t) => candidates.includes(t as never)) ?? null;
}

function findText(tokens: string[]): string | null {
  // Match: text-white | text-black | text-gray-500 | text-orange-500 | text-[#hex]
  return (
    tokens.find((t) =>
      /^text-(white|black|[a-z]+-\d+|\[#[0-9a-fA-F]{3,8}\])$/.test(t),
    ) ?? null
  );
}

function findBg(tokens: string[]): string | null {
  return (
    tokens.find((t) =>
      /^bg-(white|black|[a-z]+-\d+|\[#[0-9a-fA-F]{3,8}\])$/.test(t),
    ) ?? null
  );
}

function findPadding(tokens: string[]): string | null {
  return tokens.find((t) => /^p-\d+$/.test(t)) ?? null;
}

function isSizeAlignWeight(t: string): boolean {
  return (
    (FONT_SIZES as readonly string[]).includes(t) ||
    (FONT_WEIGHTS as readonly string[]).includes(t) ||
    (TEXT_ALIGNS as readonly string[]).includes(t)
  );
}

function isColorToken(t: string): boolean {
  return (
    /^text-(white|black|[a-z]+-\d+|\[#[0-9a-fA-F]{3,8}\])$/.test(t) ||
    /^bg-(white|black|[a-z]+-\d+|\[#[0-9a-fA-F]{3,8}\])$/.test(t)
  );
}

function isPaddingToken(t: string): boolean {
  return /^p-\d+$/.test(t);
}

interface StyleState {
  fontSize: string | null;
  fontWeight: string | null;
  textAlign: string | null;
  textColor: string | null;
  bgColor: string | null;
  padding: string | null;
}

function parseClassName(className: string): StyleState {
  const tokens = tokenize(className);
  return {
    fontSize: findOne(tokens, FONT_SIZES),
    fontWeight: findOne(tokens, FONT_WEIGHTS),
    textAlign: findOne(tokens, TEXT_ALIGNS),
    textColor: findText(tokens),
    bgColor: findBg(tokens),
    padding: findPadding(tokens),
  };
}

function buildClassName(original: string, next: StyleState): string {
  // Strip any tokens we manage; keep everything else (custom utilities, etc.)
  const kept = tokenize(original).filter(
    (t) => !isSizeAlignWeight(t) && !isColorToken(t) && !isPaddingToken(t),
  );
  const additions = [
    next.fontSize,
    next.fontWeight,
    next.textAlign,
    next.textColor,
    next.bgColor,
    next.padding,
  ].filter((v): v is string => Boolean(v));
  return [...kept, ...additions].join(" ").trim();
}

// ─── Small UI atoms ──────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: readonly string[];
  placeholder: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border-[0.5px] border-[#e5e5e5] bg-white px-2.5 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors hover:border-[#F97316]/40 focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Swatch({
  value,
  bg,
  selected,
  onClick,
}: {
  value: string;
  bg: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={value}
      className={cn(
        "h-6 w-6 rounded-full border-[0.5px] transition-all",
        selected
          ? "border-[#F97316] ring-2 ring-[#F97316]/30"
          : "border-[#e5e5e5] hover:border-[#9ca3af]",
      )}
      style={{ background: bg }}
    />
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function StylePanel({ element, onApply, onClose }: StylePanelProps) {
  const [tab, setTab] = useState<TabKey>("text");
  const initial = useMemo(() => parseClassName(element.className), [element.className]);

  const [fontSize, setFontSize] = useState<string | null>(initial.fontSize);
  const [fontWeight, setFontWeight] = useState<string | null>(initial.fontWeight);
  const [textAlign, setTextAlign] = useState<string | null>(initial.textAlign);
  const [textColor, setTextColor] = useState<string | null>(initial.textColor);
  const [textColorHex, setTextColorHex] = useState<string>("");
  const [bgColor, setBgColor] = useState<string | null>(initial.bgColor);
  const [bgColorHex, setBgColorHex] = useState<string>("");
  const [padding, setPadding] = useState<string | null>(initial.padding);
  const [textContent, setTextContent] = useState<string>(element.textContent);
  const [advanced, setAdvanced] = useState<string>(element.className);

  // Reset all state when a new element is selected
  useEffect(() => {
    const parsed = parseClassName(element.className);
    setFontSize(parsed.fontSize);
    setFontWeight(parsed.fontWeight);
    setTextAlign(parsed.textAlign);
    setTextColor(parsed.textColor);
    setTextColorHex("");
    setBgColor(parsed.bgColor);
    setBgColorHex("");
    setPadding(parsed.padding);
    setTextContent(element.textContent);
    setAdvanced(element.className);
    setTab("text");
  }, [element]);

  const hasText = element.textContent.trim().length > 0;

  const handleApply = () => {
    let newClassName: string;
    if (tab === "advanced") {
      newClassName = advanced.trim();
    } else {
      const finalText = textColorHex
        ? `text-[${textColorHex.startsWith("#") ? textColorHex : `#${textColorHex}`}]`
        : textColor;
      const finalBg = bgColorHex
        ? `bg-[${bgColorHex.startsWith("#") ? bgColorHex : `#${bgColorHex}`}]`
        : bgColor;
      newClassName = buildClassName(element.className, {
        fontSize,
        fontWeight,
        textAlign,
        textColor: finalText,
        bgColor: finalBg,
        padding,
      });
    }
    const trimmedContent = textContent.trim();
    const contentChanged =
      hasText && trimmedContent.length > 0 && trimmedContent !== element.textContent.trim();
    onApply(newClassName, contentChanged ? trimmedContent : undefined);
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[260px] bg-white border-l border-[#e5e5e5] z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#1a1a1a]">Style panel</span>
          <span className="rounded-full bg-[#FFF7ED] border border-[#F97316]/30 px-2 py-0.5 text-[11px] font-medium text-[#F97316]">
            {element.tagName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
          title="Close (ESC)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#e5e5e5]">
        {(["text", "colors", "spacing", "advanced"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 px-2 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors",
              tab === t
                ? "text-[#F97316] border-b-2 border-[#F97316] -mb-[0.5px]"
                : "text-[#9ca3af] hover:text-[#374151]",
            )}
          >
            {t === "advanced" ? "Adv" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {tab === "text" && (
          <>
            {hasText && (
              <div className="space-y-1.5">
                <FieldLabel>Text content</FieldLabel>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border-[0.5px] border-[#e5e5e5] px-2.5 py-1.5 text-[12px] text-[#1a1a1a] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <FieldLabel>Font size</FieldLabel>
              <Select
                value={fontSize}
                onChange={setFontSize}
                options={FONT_SIZES}
                placeholder="(default)"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Font weight</FieldLabel>
              <Select
                value={fontWeight}
                onChange={setFontWeight}
                options={FONT_WEIGHTS}
                placeholder="(default)"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Text align</FieldLabel>
              <div className="flex gap-1">
                {[
                  { value: "text-left", icon: AlignLeft },
                  { value: "text-center", icon: AlignCenter },
                  { value: "text-right", icon: AlignRight },
                ].map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTextAlign(textAlign === value ? null : value)}
                    className={cn(
                      "flex-1 flex items-center justify-center rounded-md border-[0.5px] py-1.5 transition-colors",
                      textAlign === value
                        ? "border-[#F97316] bg-[#FFF7ED] text-[#F97316]"
                        : "border-[#e5e5e5] text-[#6b7280] hover:border-[#9ca3af]",
                    )}
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "colors" && (
          <>
            <div className="space-y-1.5">
              <FieldLabel>Text color</FieldLabel>
              <div className="flex items-center gap-1.5">
                {TEXT_COLOR_SWATCHES.map((s) => (
                  <Swatch
                    key={s.value}
                    value={s.value}
                    bg={s.bg}
                    selected={textColor === s.value && !textColorHex}
                    onClick={() => {
                      setTextColor(s.value);
                      setTextColorHex("");
                    }}
                  />
                ))}
              </div>
              <input
                value={textColorHex}
                onChange={(e) => setTextColorHex(e.target.value)}
                placeholder="#hex"
                className="w-full rounded-md border-[0.5px] border-[#e5e5e5] px-2.5 py-1.5 font-mono text-[11px] text-[#1a1a1a] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Background</FieldLabel>
              <div className="flex items-center gap-1.5">
                {BG_COLOR_SWATCHES.map((s) => (
                  <Swatch
                    key={s.value}
                    value={s.value}
                    bg={s.bg}
                    selected={bgColor === s.value && !bgColorHex}
                    onClick={() => {
                      setBgColor(s.value);
                      setBgColorHex("");
                    }}
                  />
                ))}
              </div>
              <input
                value={bgColorHex}
                onChange={(e) => setBgColorHex(e.target.value)}
                placeholder="#hex"
                className="w-full rounded-md border-[0.5px] border-[#e5e5e5] px-2.5 py-1.5 font-mono text-[11px] text-[#1a1a1a] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
              />
            </div>
          </>
        )}

        {tab === "spacing" && (
          <div className="space-y-1.5">
            <FieldLabel>Padding (all sides)</FieldLabel>
            <Select
              value={padding}
              onChange={setPadding}
              options={PADDINGS}
              placeholder="(no padding utility)"
            />
            <p className="text-[11px] leading-relaxed text-[#9ca3af]">
              For per-side control, use the Advanced tab and add{" "}
              <code className="rounded bg-[#f3f4f6] px-1 py-0.5 font-mono text-[10px]">
                px-N
              </code>{" "}
              /{" "}
              <code className="rounded bg-[#f3f4f6] px-1 py-0.5 font-mono text-[10px]">
                py-N
              </code>{" "}
              utilities directly.
            </p>
          </div>
        )}

        {tab === "advanced" && (
          <div className="space-y-1.5">
            <FieldLabel>Full className</FieldLabel>
            <textarea
              value={advanced}
              onChange={(e) => setAdvanced(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full resize-none rounded-md border-[0.5px] border-[#e5e5e5] px-2.5 py-1.5 font-mono text-[11px] text-[#1a1a1a] outline-none transition-colors focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
            />
            <p className="text-[11px] text-[#9ca3af]">
              Edits here override all other tabs on Apply.
            </p>
          </div>
        )}
      </div>

      {/* Apply button */}
      <div className="border-t border-[#e5e5e5] p-3">
        <button
          onClick={handleApply}
          className="w-full rounded-xl bg-[#F97316] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#EA580C]"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export default StylePanel;
