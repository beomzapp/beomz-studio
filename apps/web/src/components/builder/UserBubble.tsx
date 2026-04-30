/**
 * UserBubble — right-aligned orange-tint bubble for user messages.
 *
 * Contract (BEO-725):
 *   - Rendered for `user` messages.
 *   - Long messages and `isSystem` messages collapse with a chevron toggle
 *     (matches the legacy "Build a todo app with core task m..." ▼ behaviour).
 *   - Image attachments render as a thumbnail above any caption text.
 *   - Pure presentational — never triggers a build.
 */
import { useState, type CSSProperties } from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { ChevronDown, ChevronUp } from "lucide-react";
import { UserAvatar } from "./Avatars";

type UserMsg = Extract<ChatMessage, { type: "user" }>;

const COLLAPSE_THRESHOLD = 200;
const PREVIEW_LENGTH = 150;
const DATA_URI_IN_TEXT = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/;

function looksLikeRawBase64(s: string): boolean {
  const t = s.replace(/\s/g, "");
  return t.length >= 80 && /^[A-Za-z0-9+/]+=*$/.test(t);
}

function mediaTypeFromBase64Prefix(b64: string): string {
  const t = b64.replace(/\s/g, "");
  if (t.startsWith("iVBORw")) return "image/png";
  if (t.startsWith("/9j/")) return "image/jpeg";
  if (t.startsWith("R0lGOD")) return "image/gif";
  if (t.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

/** Resolve any of: data URI, http(s), blob:, raw base64 → usable <img> src. */
function resolveImageSrc(imageUrl: string | undefined, content: string): string | null {
  if (imageUrl) {
    const u = imageUrl.trim();
    if (u.startsWith("data:")) return u;
    if (/^https?:\/\//i.test(u) || u.startsWith("blob:")) return u;
    if (looksLikeRawBase64(u)) {
      const mt = mediaTypeFromBase64Prefix(u);
      return `data:${mt};base64,${u.replace(/\s/g, "")}`;
    }
  }
  const m = content.match(DATA_URI_IN_TEXT);
  if (m) return m[0];
  const c = content.trim();
  if (looksLikeRawBase64(c)) {
    const mt = mediaTypeFromBase64Prefix(c);
    return `data:${mt};base64,${c.replace(/\s/g, "")}`;
  }
  return null;
}

function textAfterStrippingImage(content: string, imageSrc: string | null): string {
  if (!imageSrc) return content;
  let t = content;
  if (t.includes(imageSrc)) t = t.split(imageSrc).join("");
  else t = t.replace(DATA_URI_IN_TEXT, "");
  return t.replace(/\s+/g, " ").trim();
}

const thumbStyle: CSSProperties = {
  maxWidth: 120,
  maxHeight: 80,
  borderRadius: 6,
  objectFit: "cover",
};

function ImageThumb({ src }: { src: string }) {
  return <img src={src} alt="" style={thumbStyle} className="mb-2 block w-auto" />;
}

interface UserBubbleProps {
  message: UserMsg;
  avatarUrl?: string;
  initials?: string;
}

export function UserBubble({ message, avatarUrl, initials }: UserBubbleProps) {
  const isSystem = message.isSystem === true;
  const isLong = message.content.length > COLLAPSE_THRESHOLD;

  if (isSystem || isLong) {
    return <CollapsibleBubble message={message} avatarUrl={avatarUrl} initials={initials} />;
  }

  const imageSrc = resolveImageSrc(message.imageUrl, message.content);
  const displayText = textAfterStrippingImage(message.content, imageSrc);
  const showTextBody = displayText.length > 0 && !/^attached$/i.test(displayText.trim());
  const showAttachedFallback =
    !imageSrc && Boolean(message.imageUrl?.trim()) && !showTextBody;
  const showBodyText =
    showTextBody || (!imageSrc && !showAttachedFallback && message.content.length > 0);

  return (
    <div className="flex items-end justify-end gap-2">
      <div className="max-w-[70%] min-w-0 rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px] border border-[rgba(255,104,0,0.25)] bg-[rgba(255,104,0,0.18)] px-3.5 py-2 text-sm leading-relaxed text-[#1a1a1a] break-words">
        {imageSrc && <ImageThumb src={imageSrc} />}
        {showAttachedFallback && "Attached"}
        {showBodyText && (showTextBody ? displayText : message.content)}
      </div>
      <UserAvatar avatarUrl={avatarUrl} initials={initials} />
    </div>
  );
}

function CollapsibleBubble({ message, avatarUrl, initials }: UserBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const isSystem = message.isSystem === true;
  const imageSrc = resolveImageSrc(message.imageUrl, message.content);
  const displayText = textAfterStrippingImage(message.content, imageSrc);
  const showTextBody = displayText.length > 0 && !/^attached$/i.test(displayText.trim());
  const showAttachedFallback =
    !imageSrc && Boolean(message.imageUrl?.trim()) && !showTextBody;

  const collapsedPreview = (() => {
    if (isSystem) {
      if (showTextBody) {
        return `${displayText.slice(0, PREVIEW_LENGTH)}${
          displayText.length > PREVIEW_LENGTH ? "…" : ""
        }`;
      }
      return "System instructions";
    }
    if (showTextBody) {
      return `${displayText.slice(0, PREVIEW_LENGTH)}${
        displayText.length > PREVIEW_LENGTH ? "…" : ""
      }`;
    }
    if (imageSrc) return "";
    if (showAttachedFallback) return "Attached";
    return `${message.content.slice(0, PREVIEW_LENGTH)}${
      message.content.length > PREVIEW_LENGTH ? "…" : ""
    }`;
  })();

  const expandedText = (() => {
    if (showTextBody) return displayText;
    if (isSystem) return message.content;
    if (imageSrc || showAttachedFallback) return null;
    return message.content;
  })();

  return (
    <div className="flex items-end justify-end gap-2">
      <button
        className="max-w-[80%] min-w-0 cursor-pointer rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px] border border-[rgba(255,104,0,0.25)] bg-[rgba(255,104,0,0.18)] px-3.5 py-2 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {imageSrc && <ImageThumb src={imageSrc} />}
        {showAttachedFallback && <span className="text-sm text-[#1a1a1a]">Attached</span>}
        {expanded ? (
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 break-words text-sm leading-relaxed text-[#1a1a1a]">
              {expandedText}
            </span>
            <ChevronUp size={14} className="mt-0.5 flex-shrink-0 text-[#6b7280]" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-[#6b7280]">{collapsedPreview}</span>
            <ChevronDown size={14} className="flex-shrink-0 text-[#6b7280]" />
          </div>
        )}
      </button>
      <UserAvatar avatarUrl={avatarUrl} initials={initials} />
    </div>
  );
}
