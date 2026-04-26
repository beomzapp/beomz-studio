import type { ProjectChatHistoryEntry } from "./projectChat.js";

export interface ClarificationTrackingState {
  askedCount: number;
  askedQuestions: string[];
  answeredCount: number;
  answeredQuestions: string[];
  askedQuestionKeys: Set<string>;
  answeredQuestionKeys: Set<string>;
}

function sanitiseQuestionText(value: string): string {
  return value
    .replace(/[`*_#>~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseClarifyingQuestion(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = sanitiseQuestionText(value);
  if (!trimmed.endsWith("?")) {
    return null;
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9? ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

export function buildClarificationTrackingState(
  history: readonly ProjectChatHistoryEntry[] | undefined,
): ClarificationTrackingState {
  const askedQuestionMap = new Map<string, string>();
  const answeredQuestionKeys = new Set<string>();
  let pendingQuestionKey: string | null = null;

  for (const entry of history ?? []) {
    if (entry.role === "assistant") {
      const questionKey = normaliseClarifyingQuestion(entry.content);
      pendingQuestionKey = null;

      if (!questionKey) {
        continue;
      }

      if (!askedQuestionMap.has(questionKey)) {
        askedQuestionMap.set(questionKey, sanitiseQuestionText(entry.content));
      }
      pendingQuestionKey = questionKey;
      continue;
    }

    if (entry.role === "user" && pendingQuestionKey) {
      answeredQuestionKeys.add(pendingQuestionKey);
      pendingQuestionKey = null;
    }
  }

  const askedQuestions = [...askedQuestionMap.values()];
  const answeredQuestions = askedQuestions.filter((question) => {
    const questionKey = normaliseClarifyingQuestion(question);
    return questionKey ? answeredQuestionKeys.has(questionKey) : false;
  });

  return {
    askedCount: askedQuestions.length,
    askedQuestions,
    answeredCount: answeredQuestions.length,
    answeredQuestions,
    askedQuestionKeys: new Set(askedQuestionMap.keys()),
    answeredQuestionKeys,
  };
}
