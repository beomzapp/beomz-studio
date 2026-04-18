import Anthropic from "@anthropic-ai/sdk";

import { normalisePlanningMessages, type PlanningChatMessage } from "./chatMode.js";

const SUMMARISE_MODEL = "claude-haiku-4-5-20251001";
const SUMMARISE_SYSTEM_PROMPT = "Summarise this planning conversation into a single precise build prompt. Capture all features discussed, design decisions, and overall scope. Output only the prompt — no preamble, no explanation. Max 150 words.";

export type SummariseChatThreadInvoker = (request: {
  maxTokens: number;
  messages: { role: "user"; content: string }[];
  model: string;
  system: string;
}) => Promise<string>;

function formatConversation(messages: readonly PlanningChatMessage[]): string {
  return messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
}

function toTextResponse(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

async function defaultInvoke(request: {
  maxTokens: number;
  messages: { role: "user"; content: string }[];
  model: string;
  system: string;
}): Promise<string> {
  const { apiConfig } = await import("../config.js");

  if (!apiConfig.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }

  const client = new Anthropic({ apiKey: apiConfig.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: request.model,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: request.messages,
  });

  return toTextResponse(response);
}

export async function summariseChatThread(
  rawMessages: readonly unknown[],
  invokeModel: SummariseChatThreadInvoker = defaultInvoke,
): Promise<{ prompt: string }> {
  const messages = normalisePlanningMessages(rawMessages);
  if (messages.length === 0) {
    throw new Error("No conversational messages to summarise.");
  }

  const prompt = (await invokeModel({
    model: SUMMARISE_MODEL,
    maxTokens: 220,
    system: SUMMARISE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: formatConversation(messages),
      },
    ],
  })).trim();

  if (prompt.length === 0) {
    throw new Error("Summariser returned an empty prompt.");
  }

  return { prompt };
}
