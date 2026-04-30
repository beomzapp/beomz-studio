/**
 * MarkdownText — minimal markdown renderer used by every chat message
 * component. Supports paragraphs, bullet/ordered lists, ATX headings,
 * inline bold/italic/code, and fenced code blocks (rendered via the
 * collapsible code block below).
 *
 * BEO-725: extracted from the legacy ChatMessage.tsx so AIMessage,
 * AIIntroMessage and BuildSummary can share one renderer.
 */
import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handleCopy} title="Copy">
      {copied ? (
        <Check className="h-3.5 w-3.5 text-zinc-300" />
      ) : (
        <Copy className="h-3.5 w-3.5 cursor-pointer text-zinc-300 hover:text-zinc-500" />
      )}
    </button>
  );
}

function CollapsibleCodeBlock({ lang, content }: { lang: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[#e5e5e5] bg-[#f5f5f3]">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]"
      >
        <span className="font-mono text-xs text-[#6b7280]">{lang}</span>
        <div className="flex items-center gap-2">
          <span onClick={e => e.stopPropagation()}>
            <CopyButton content={content} />
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-[#9ca3af]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[#9ca3af]" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[#e5e5e5]">
          <pre className="overflow-x-auto px-3 py-2.5">
            <code className="whitespace-pre font-mono text-[13px] leading-relaxed text-[#374151]">
              {content}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**") && part.length > 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length > 2)
    ) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[13px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null;
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];

  const flushList = () => {
    if (!listBuffer) return;
    const isOrdered = listBuffer.type === "ol";
    const items = listBuffer.items;
    elements.push(
      isOrdered ? (
        <ol key={`list-${elements.length}`} className="space-y-1 my-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed text-[#374151]">
              <span className="flex-shrink-0 select-none text-zinc-400">{idx + 1}.</span>
              <span className="min-w-0">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul key={`list-${elements.length}`} className="space-y-1 my-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed text-[#374151]">
              <span className="flex-shrink-0 select-none text-zinc-400">•</span>
              <span className="min-w-0">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      ),
    );
    listBuffer = null;
  };

  const flushCodeBlock = () => {
    const codeContent = codeLines.join("\n");
    const lang = codeLang || "code";
    elements.push(
      <CollapsibleCodeBlock key={`code-${elements.length}`} lang={lang} content={codeContent} />,
    );
    inCodeBlock = false;
    codeLang = "";
    codeLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inCodeBlock) {
      const fenceMatch = line.match(/^```(\w*)/);
      if (fenceMatch) {
        flushList();
        inCodeBlock = true;
        codeLang = fenceMatch[1] ?? "";
        codeLines = [];
        continue;
      }
    } else {
      if (line.trimEnd() === "```" || line.startsWith("```")) {
        flushCodeBlock();
      } else {
        codeLines.push(line);
      }
      continue;
    }

    const ulMatch = line.match(/^[-•*]\s+(.*)/);
    const olMatch = line.match(/^\d+[.)]\s+(.*)/);
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);

    if (ulMatch) {
      if (listBuffer?.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer!.items.push(ulMatch[1]);
    } else if (olMatch) {
      if (listBuffer?.type !== "ol") {
        flushList();
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer!.items.push(olMatch[1]);
    } else if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      elements.push(
        <p
          key={`h-${i}`}
          className={`font-semibold text-[#1a1a1a] break-words ${
            level === 1 ? "text-base mt-3 mb-1" : "text-sm mt-2 mb-0.5"
          }`}
        >
          {renderInline(headingMatch[2])}
        </p>,
      );
    } else {
      flushList();
      if (line.trim() === "") {
        elements.push(<div key={`br-${i}`} className="h-2" />);
      } else {
        elements.push(
          <p key={`p-${i}`} className="text-sm leading-relaxed text-[#374151] break-words">
            {renderInline(line)}
          </p>,
        );
      }
    }
  }

  if (inCodeBlock) flushCodeBlock();
  else flushList();

  return <>{elements}</>;
}

export { CopyButton };
