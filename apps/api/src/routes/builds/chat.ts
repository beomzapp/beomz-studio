import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { StudioFile } from "@beomz-studio/contracts";
import type { ProjectRow } from "@beomz-studio/studio-db";
import type Anthropic from "@anthropic-ai/sdk";

import { loadOrgContext } from "../../middleware/loadOrgContext.js";
import { verifyPlatformJwt } from "../../middleware/verifyPlatformJwt.js";
import type { OrgContext } from "../../types.js";
import {
  getImplementSuggestionDecision,
  normalisePlanningMessages,
} from "../../lib/chatMode.js";
import {
  appendProjectChatHistory,
  buildConversationMessages,
  buildProjectMemoryPrompt,
  type ProjectChatHistoryEntry,
  readProjectChatHistory,
} from "../../lib/projectChat.js";
import { anthropic } from "../plan/shared.js";

const BASE_CHAT_MODE_SYSTEM_PROMPT = [
  "You are Beomz, a warm and sharp senior AI product builder.",
  "Keep responses natural, concise, and helpful.",
  "If the request is clear, respond directly instead of asking extra questions.",
  "If the request is ambiguous, ask exactly one targeted clarifying question.",
  "Avoid robotic question lists, onboarding interviews, and generic filler.",
  "For greetings or small talk, reply warmly and briefly.",
  "If there is no existing app context yet, guide the user with one focused question at a time and say when you have enough to build.",
].join(" ");

function buildChatModeSystemPrompt(projectName?: string | null, files: readonly StudioFile[] = []): string {
  if (files.length > 0) {
    return `${BASE_CHAT_MODE_SYSTEM_PROMPT}\n\n${buildProjectMemoryPrompt({ appName: projectName, files })}`;
  }

  return BASE_CHAT_MODE_SYSTEM_PROMPT;
}

type ChatAnthropicMessage = Anthropic.MessageParam;
interface BuildsChatRouteDeps {
  authMiddleware?: typeof verifyPlatformJwt;
  loadOrgContextMiddleware?: typeof loadOrgContext;
  createMessageStream?: (input: {
    max_tokens: number;
    messages: ChatAnthropicMessage[];
    model: string;
    system: string;
  }) => AsyncIterable<unknown>;
}

function isTextDeltaEvent(event: unknown): event is {
  type: "content_block_delta";
  delta: {
    type: "text_delta";
    text: string;
  };
} {
  if (typeof event !== "object" || event === null) {
    return false;
  }

  const record = event as Record<string, unknown>;
  const delta = record.delta;
  if (record.type !== "content_block_delta" || typeof delta !== "object" || delta === null) {
    return false;
  }

  const deltaRecord = delta as Record<string, unknown>;
  return deltaRecord.type === "text_delta" && typeof deltaRecord.text === "string";
}

function buildAnthropicUserContent(
  text: string,
  imageUrl?: string,
): ChatAnthropicMessage["content"] {
  if (!imageUrl) {
    return text;
  }

  const trimmedText = text.trim();
  return [
    { type: "image", source: { type: "url", url: imageUrl } },
    {
      type: "text",
      text: trimmedText.length > 0 ? trimmedText : "User attached an image for context.",
    },
  ];
}

function attachImageToLatestUserMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  imageUrl?: string,
): ChatAnthropicMessage[] {
  if (!imageUrl) {
    return messages;
  }

  const lastUserIndex = [...messages].reverse().findIndex((message) => message.role === "user");
  if (lastUserIndex === -1) {
    return messages;
  }

  const targetIndex = messages.length - 1 - lastUserIndex;
  return messages.map((message, index) => {
    if (index !== targetIndex || message.role !== "user") {
      return message;
    }

    return {
      role: "user",
      content: buildAnthropicUserContent(message.content, imageUrl),
    };
  });
}

const requestSchema = z.object({
  imageUrl: z.string().trim().url().optional(),
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
  projectId: z.string().uuid().optional(),
});

export function createBuildsChatRoute(deps: BuildsChatRouteDeps = {}) {
  const route = new Hono();

  route.post(
    "/",
    deps.authMiddleware ?? verifyPlatformJwt,
    deps.loadOrgContextMiddleware ?? loadOrgContext,
    async (c) => {
      const orgContext = c.get("orgContext") as OrgContext;
      const body = await c.req.json().catch(() => null);
      const parsed = requestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ details: parsed.error.flatten(), error: "Invalid chat request body." }, 400);
      }

      const { imageUrl, messages: rawMessages, projectId } = parsed.data;

      let project: ProjectRow | null = null;
      let projectFiles: readonly StudioFile[] = [];
      let projectHistory: ProjectChatHistoryEntry[] = [];

      if (projectId) {
        project = await orgContext.db.findProjectById(projectId);
        if (!project || project.org_id !== orgContext.org.id) {
          return c.json({ error: "Project not found." }, 404);
        }

        const latestGeneration = await orgContext.db.findLatestGenerationByProjectId(projectId).catch(() => null);
        projectFiles = Array.isArray(latestGeneration?.files)
          ? latestGeneration.files as StudioFile[]
          : [];
        projectHistory = readProjectChatHistory(project.chat_history);
      }

      const messages = normalisePlanningMessages(rawMessages);
      if (messages.length === 0) {
        return c.json({ error: "No conversational messages found." }, 400);
      }

      const currentUserMessage = [...messages].reverse().find((message) => message.role === "user");
      if (!currentUserMessage) {
        return c.json({ error: "No user message found." }, 400);
      }

      const modelMessages = attachImageToLatestUserMessage(
        projectId
          ? buildConversationMessages(projectHistory, currentUserMessage.content)
          : messages.slice(-25),
        imageUrl,
      );
      const systemPrompt = buildChatModeSystemPrompt(project?.name ?? null, projectFiles);

      return streamSSE(c, async (sse) => {
        let nextEventId = 1;
        let assistantResponse = "";

        const writeEvent = async (event: string, payload: Record<string, unknown>) => {
          const id = String(nextEventId++);
          await sse.writeSSE({
            event,
            id,
            data: JSON.stringify({
              id,
              operation: "clarify_plan",
              timestamp: new Date().toISOString(),
              ...payload,
            }),
          });
        };

        const stream = (deps.createMessageStream ?? ((input) => anthropic.messages.stream(input)))({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: systemPrompt,
          messages: modelMessages,
        });

        for await (const event of stream) {
          if (
            isTextDeltaEvent(event)
            && event.delta.type === "text_delta"
            && event.delta.text.length > 0
          ) {
            assistantResponse += event.delta.text;
            await writeEvent("chat_response", {
              type: "chat_response",
              delta: event.delta.text,
            });
          }
        }

        if (projectId && assistantResponse.trim().length > 0) {
          const updatedHistory = appendProjectChatHistory(
            project?.chat_history,
            currentUserMessage.content,
            assistantResponse,
          );

          await orgContext.db.updateProject(projectId, {
            chat_history: updatedHistory,
          }).catch((error: unknown) => {
            console.warn(
              "[builds/chat] failed to persist chat_history (non-fatal):",
              error instanceof Error ? error.message : String(error),
            );
          });
        }

        const decision = getImplementSuggestionDecision(messages, assistantResponse);
        if (decision.shouldEmit && decision.summary) {
          await writeEvent("implement_suggestion", {
            type: "implement_suggestion",
            summary: decision.summary,
          });
        }
      });
    },
  );

  return route;
}

const buildsChatRoute = createBuildsChatRoute();

export default buildsChatRoute;
