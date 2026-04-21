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
  type ProjectChatHistoryEntry,
  appendProjectChatHistory,
  readProjectChatHistory,
  shouldRefreshProjectChatSummary,
} from "../../lib/projectChat.js";
import {
  CHAT_IMAGE_ANALYSIS_SURCHARGE,
  CHAT_MESSAGE_COST_HAIKU,
  CHAT_MESSAGE_COST_SONNET,
  isAdminEmail,
} from "../../lib/credits.js";
import { generateProjectChatSummary } from "../../lib/projectChatSummary.js";
import {
  buildAnthropicImageBlock,
  isSupportedAnthropicImageUrl,
} from "../../lib/anthropicImages.js";
import {
  buildClarifyingQuestionSystemPrompt,
  buildStructuredChatSystemPrompt,
  parseStructuredChatResponse,
} from "../../lib/chatPrompts.js";
import { classifyIntent } from "../../lib/intentClassifier.js";
import { extractUrlLike, fetchUrlContent } from "../../lib/webFetch.js";
import { anthropic } from "../plan/shared.js";

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
    buildAnthropicImageBlock(imageUrl),
    {
      type: "text",
      text: trimmedText.length > 0 ? trimmedText : "User attached an image for context.",
    },
  ];
}

function calculateChatCreditCharge(model: string, hasImage: boolean): number {
  const baseCost = model.includes("haiku")
    ? CHAT_MESSAGE_COST_HAIKU
    : CHAT_MESSAGE_COST_SONNET;
  return baseCost + (hasImage ? CHAT_IMAGE_ANALYSIS_SURCHARGE : 0);
}

async function loadWebsiteContext(message: string) {
  const url = extractUrlLike(message);
  if (!url) {
    return null;
  }

  const content = await fetchUrlContent(url);
  return {
    url,
    content,
    fetchFailed: content === null,
  };
}

const requestSchema = z.object({
  imageUrl: z.string().trim().refine(isSupportedAnthropicImageUrl, {
    message: "imageUrl must be an http(s) URL or a data:image/*;base64 URL.",
  }).optional(),
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
      const chatModel = "claude-sonnet-4-6";
      const creditsToDeduct = calculateChatCreditCharge(chatModel, Boolean(imageUrl));

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

      const intentDecision = await classifyIntent(
        currentUserMessage.content,
        projectFiles.length > 0,
        Boolean(imageUrl),
      );

      if (!isAdminEmail(orgContext.user.email)) {
        const freshOrg = typeof orgContext.db.getOrgWithBalance === "function"
          ? await orgContext.db.getOrgWithBalance(orgContext.org.id).catch(() => null)
          : null;
        const totalAvailable = Number(freshOrg?.credits ?? orgContext.org.credits ?? 0)
          + Number(freshOrg?.topup_credits ?? orgContext.org.topup_credits ?? 0);

        if (totalAvailable <= 0) {
          return c.json({
            error: "You’re out of credits for chat right now. Top up or upgrade to keep going.",
            available: totalAvailable,
            required: creditsToDeduct,
          }, 402);
        }
      }

      const contextHistory = projectId
        ? projectHistory
        : messages.slice(0, -1).map((message, index) => ({
            role: message.role,
            content: message.content,
            timestamp: new Date(index).toISOString(),
          }));
      const websiteContext = await loadWebsiteContext(currentUserMessage.content);
      const systemPrompt = intentDecision.intent === "ambiguous"
        ? buildClarifyingQuestionSystemPrompt({
            projectName: project?.name ?? null,
            chatSummary: typeof project?.chat_summary === "string" ? project.chat_summary : null,
            existingFiles: projectFiles,
            chatHistory: contextHistory,
            websiteContext,
          })
        : buildStructuredChatSystemPrompt({
            projectName: project?.name ?? null,
            chatSummary: typeof project?.chat_summary === "string" ? project.chat_summary : null,
            existingFiles: projectFiles,
            chatHistory: contextHistory,
            websiteContext,
          });
      const modelMessages: ChatAnthropicMessage[] = [
        {
          role: "user",
          content: buildAnthropicUserContent(currentUserMessage.content, imageUrl),
        },
      ];

      return streamSSE(c, async (sse) => {
        let nextEventId = 1;
        let rawAssistantResponse = "";

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
          model: chatModel,
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
            rawAssistantResponse += event.delta.text;
          }
        }

        const assistantResponse = intentDecision.intent === "ambiguous"
          ? {
              message: rawAssistantResponse.trim(),
              readyToImplement: false,
              implementPlan: null,
            }
          : parseStructuredChatResponse(rawAssistantResponse);
        if (assistantResponse.message.trim().length > 0) {
          await writeEvent("chat_response", {
            type: "chat_response",
            delta: assistantResponse.message,
          });
        }

        if (assistantResponse.readyToImplement && assistantResponse.implementPlan) {
          await writeEvent("ready_to_implement", {
            type: "ready_to_implement",
            readyToImplement: true,
            implementPlan: assistantResponse.implementPlan,
            plan: assistantResponse.implementPlan,
          });
        }

        if (projectId && assistantResponse.message.trim().length > 0) {
          const updatedHistory = appendProjectChatHistory(
            project?.chat_history,
            currentUserMessage.content,
            assistantResponse.message,
          );
          const nextChatSummary = shouldRefreshProjectChatSummary(updatedHistory.length)
            ? await generateProjectChatSummary({
                appName: project?.name ?? null,
                existingSummary: typeof project?.chat_summary === "string" ? project.chat_summary : null,
                files: projectFiles,
                history: updatedHistory,
              })
            : (typeof project?.chat_summary === "string" ? project.chat_summary : null);

          try {
            await orgContext.db.updateProject(projectId, {
              chat_history: updatedHistory,
              chat_summary: nextChatSummary,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/chat_summary/i.test(message)) {
              await orgContext.db.updateProject(projectId, {
                chat_history: updatedHistory,
              }).catch(() => undefined);
              console.warn("[builds/chat] chat_summary column missing — persisted chat_history only.");
            } else {
              console.warn("[builds/chat] failed to persist chat memory (non-fatal):", message);
            }
          }
        }

        if (assistantResponse.message.trim().length > 0 && !isAdminEmail(orgContext.user.email)) {
          orgContext.db.applyOrgUsageDeduction(
            orgContext.org.id,
            creditsToDeduct,
            undefined,
            imageUrl ? "Chat response (Sonnet + vision)" : "Chat response",
          ).catch((error: unknown) => {
            console.error(
              "[builds/chat] chat credit deduction failed (non-fatal):",
              error instanceof Error ? error.message : String(error),
            );
          });
        }

        const decision = assistantResponse.readyToImplement
          ? { shouldEmit: false, summary: null }
          : getImplementSuggestionDecision(messages, assistantResponse.message);
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
