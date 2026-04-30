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
}

export function AIIntroMessage({ content, isNewMessage }: AIIntroMessageProps) {
  return (
    <div className="flex items-start gap-2">
      <BAvatar />
      <div className="min-w-0 flex-1 break-words">
        <div className="text-sm leading-relaxed text-[#374151] break-words">
          {isNewMessage ? <TypewriterText text={content} /> : <MarkdownText text={content} />}
        </div>
      </div>
    </div>
  );
}
