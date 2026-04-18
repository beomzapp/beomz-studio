export interface PlanningChatMessage {
  role: "user" | "assistant";
  content: string;
}

type UnknownRecord = Record<string, unknown>;

const MANUAL_IMPLEMENT_PATTERN = /\b(build it|implement|go ahead|let'?s do it)\b/i;
const READY_TO_BUILD_SIGNAL = "i think i have enough to build";

function normaliseContent(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPlanningMessage(input: UnknownRecord): PlanningChatMessage | null {
  const role = input.role;
  const type = input.type;

  if ((role === "user" || role === "assistant") && typeof role === "string") {
    const content = normaliseContent(input.content);
    return content ? { role, content } : null;
  }

  if (type === "user") {
    const content = normaliseContent(input.content);
    return content ? { role: "user", content } : null;
  }

  if (
    type === "question_answer"
    || type === "pre_build_ack"
    || type === "clarifying_question"
    || type === "chat_response"
    || type === "error"
  ) {
    const content = normaliseContent(input.content);
    return content ? { role: "assistant", content } : null;
  }

  if (type === "build_summary") {
    const content = normaliseContent(input.content);
    return content ? { role: "assistant", content } : null;
  }

  if (type === "building") {
    const summary = input.summary;
    if (typeof summary === "object" && summary !== null) {
      const content = normaliseContent((summary as UnknownRecord).content);
      return content ? { role: "assistant", content } : null;
    }
  }

  return null;
}

export function normalisePlanningMessages(messages: readonly unknown[]): PlanningChatMessage[] {
  const normalised: PlanningChatMessage[] = [];

  for (const message of messages) {
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      continue;
    }

    const nextMessage = toPlanningMessage(message as UnknownRecord);
    if (!nextMessage) {
      continue;
    }

    const previous = normalised.at(-1);
    if (previous && previous.role === nextMessage.role) {
      previous.content = `${previous.content}\n\n${nextMessage.content}`;
      continue;
    }

    normalised.push(nextMessage);
  }

  return normalised;
}

export function countCompletedExchanges(messages: readonly PlanningChatMessage[]): number {
  let exchanges = 0;

  for (let index = 0; index < messages.length - 1; index += 1) {
    if (messages[index]?.role === "user" && messages[index + 1]?.role === "assistant") {
      exchanges += 1;
    }
  }

  return exchanges;
}

export function containsReadyToBuildSignal(text: string): boolean {
  return text.toLowerCase().includes(READY_TO_BUILD_SIGNAL);
}

export function isManualImplementRequest(text: string): boolean {
  return MANUAL_IMPLEMENT_PATTERN.test(text);
}

function trimSentence(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s\-:–—]+/, "")
    .trim();
}

function extractSummaryFromAssistant(responseText: string): string {
  const normalised = responseText.replace(/\s+/g, " ").trim();
  const signalIndex = normalised.toLowerCase().indexOf(READY_TO_BUILD_SIGNAL);

  if (signalIndex >= 0) {
    const afterSignal = trimSentence(normalised.slice(signalIndex + READY_TO_BUILD_SIGNAL.length));
    if (afterSignal.length > 0) {
      return afterSignal.replace(/^[.!?:\-\s]+/, "").trim();
    }
  }

  return normalised;
}

function fallbackConversationSummary(messages: readonly PlanningChatMessage[]): string {
  const relevantMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .filter((content) => !isManualImplementRequest(content))
    .slice(-3);

  const summary = relevantMessages.join(" ").replace(/\s+/g, " ").trim();
  if (summary.length === 0) {
    return "Build the app based on the planning conversation so far.";
  }

  return summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}...` : summary;
}

export function buildImplementSuggestionSummary(
  messages: readonly PlanningChatMessage[],
  assistantResponse: string,
): string {
  if (containsReadyToBuildSignal(assistantResponse)) {
    return extractSummaryFromAssistant(assistantResponse);
  }

  const assistantSummary = extractSummaryFromAssistant(assistantResponse);
  if (assistantSummary.length > 0 && !assistantSummary.endsWith("?")) {
    return assistantSummary.length > 220
      ? `${assistantSummary.slice(0, 217).trimEnd()}...`
      : assistantSummary;
  }

  return fallbackConversationSummary(messages);
}

export interface ImplementSuggestionDecision {
  shouldEmit: boolean;
  summary: string | null;
}

export function getImplementSuggestionDecision(
  messages: readonly PlanningChatMessage[],
  assistantResponse: string,
): ImplementSuggestionDecision {
  if (containsReadyToBuildSignal(assistantResponse)) {
    return {
      shouldEmit: true,
      summary: buildImplementSuggestionSummary(messages, assistantResponse),
    };
  }

  const latestMessage = messages.at(-1);
  if (!latestMessage || latestMessage.role !== "user" || !isManualImplementRequest(latestMessage.content)) {
    return { shouldEmit: false, summary: null };
  }

  const priorMessages = messages.slice(0, -1);
  if (countCompletedExchanges(priorMessages) < 2) {
    return { shouldEmit: false, summary: null };
  }

  return {
    shouldEmit: true,
    summary: buildImplementSuggestionSummary(priorMessages, assistantResponse),
  };
}
