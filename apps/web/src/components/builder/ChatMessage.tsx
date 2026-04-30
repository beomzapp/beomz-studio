/**
 * ChatMessage — thin router that maps a single ChatMessage to the right
 * specialised component.
 *
 * BEO-725 (clean rewrite, replaces the patched ChatMessage.tsx):
 *
 *   - One component per message type. No business logic lives here.
 *   - Critical branch: `chat_response` with `implementPlan`
 *       • !isBuilding → <AIIntroMessage> (TypewriterText if isNew, NO button)
 *       • isBuilding  → return null (stripped from the chat instantly so
 *         BuildProgressCard / BuildingShimmer takes over without a flash)
 *
 * The floating ImplementBar above the input bar (rendered by ChatPanel) is
 * the only place a "🚀 Implement this" button ever appears. No chat-message
 * component is allowed to render that button.
 */
import type { ChatMessage } from "@beomz-studio/contracts";
import { AIIntroMessage } from "./AIIntroMessage";
import { UserBubble } from "./UserBubble";
import { ThinkingDots } from "./ThinkingDots";
import { BuildProgressCard } from "./BuildProgressCard";
import { BuildSummary } from "./BuildSummary";
import {
  AIChatResponse,
  AIClarifyingQuestion,
  AIError,
  AIImageIntent,
  AIPreBuildAck,
  AIQuestionAnswer,
  AIUrlResearch,
} from "./AIMessage";
import { ServerRestartedCard } from "./ServerRestartedCard";

interface ChatMessageViewProps {
  message: ChatMessage;
  /** True while a build is in flight — used to suppress AIIntroMessage. */
  isBuilding: boolean;
  /** True when this message was added after the panel mounted. */
  isNewMessage: boolean;
  onRetry?: () => void;
  onReportIssue?: () => void;
  onPopulateInput?: (text: string) => void;
  /** Forwarded by image_intent confirmation. */
  onImplementPlan?: (plan: string, imageUrl?: string) => void;
  userAvatarUrl?: string;
  userInitials?: string;
}

export function ChatMessageView({
  message,
  isBuilding,
  isNewMessage,
  onRetry,
  onReportIssue,
  onPopulateInput,
  onImplementPlan,
  userAvatarUrl,
  userInitials,
}: ChatMessageViewProps) {
  switch (message.type) {
    case "user":
      return (
        <UserBubble
          message={message}
          avatarUrl={userAvatarUrl}
          initials={userInitials}
        />
      );

    case "thinking":
      return <ThinkingDots />;

    case "chat_response": {
      if (message.implementPlan) {
        if (isBuilding) return null;
        return <AIIntroMessage content={message.content} isNewMessage={isNewMessage} />;
      }
      return <AIChatResponse message={message} isNewMessage={isNewMessage} />;
    }

    case "building":
      return <BuildProgressCard message={message} />;

    case "build_summary":
      return (
        <BuildSummary
          message={message}
          isNewMessage={isNewMessage}
          onPopulateInput={onPopulateInput}
        />
      );

    case "clarifying_question":
      return <AIClarifyingQuestion message={message} />;

    case "question_answer":
      return <AIQuestionAnswer message={message} />;

    case "pre_build_ack":
      return <AIPreBuildAck message={message} />;

    case "error":
      return (
        <AIError message={message} onRetry={onRetry} onReportIssue={onReportIssue} />
      );

    case "server_restarting":
      return <ServerRestartedCard onRetry={onRetry ?? (() => {})} />;

    case "image_intent":
      return (
        <AIImageIntent
          message={message}
          onConfirm={(prompt, imageUrl) => onImplementPlan?.(prompt, imageUrl)}
        />
      );

    case "url_research":
      return <AIUrlResearch message={message} />;

    default:
      return null;
  }
}
