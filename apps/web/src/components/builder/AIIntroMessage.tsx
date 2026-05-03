/**
 * AIIntroMessage — the single AI greeting that appears after the user sends
 * their first prompt and the API has produced a plan but no build is yet
 * running.
 *
 * Contract (BEO-725):
 *   - Rendered for `chat_response` messages where `implementPlan` is set
 *     AND the builder is NOT currently building.
 *   - When `isBuilding` flips to true, the parent strips this component from
 *     the chat (ChatMessage.tsx returns null for that case).
 *   - Renders TypewriterText only when `isNewMessage` is true (mounted-after).
 *   - NEVER renders an "Implement this" button. The floating ImplementBar
 *     above the input is the only place that button lives.
 *   - Plain text only — no bullet-point plan expansion (BEO-725 hard rule).
 */
import { BAvatar } from "./Avatars";
import { MarkdownText } from "./MarkdownText";
import { TypewriterText } from "./TypewriterText";

interface AIIntroMessageProps {
  content: string;
  isNewMessage: boolean;
  /** When a build is in flight this message must be invisible (BEO-729). */
  isBuilding?: boolean;
}

export function AIIntroMessage({ content, isNewMessage, isBuilding }: AIIntroMessageProps) {
  if (isBuilding) return null;

  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 break-words">
        <div className="text-[14px] leading-[1.55] tracking-[-0.01em] text-[#374151] break-words">
          {isNewMessage ? <TypewriterText text={content} /> : <MarkdownText text={content} />}
        </div>
      </div>
    </div>
  );
}
