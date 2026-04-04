import type { GenerationRow, StudioDbClient } from "@beomz-studio/studio-db";

import type { ActionResultEnvelope } from "./actions/index.js";
import type { TurnCost } from "./CreditGuard.js";
import type { AnthropicConversationMessage } from "./GenerationEngine.js";
import type { VirtualFileSystemSnapshot } from "./VirtualFileSystem.js";

export type SessionEventType = "message" | "action" | "snapshot" | "fork" | "credits";

export interface SessionEvent<TPayload = unknown> {
  sessionId: string;
  type: SessionEventType;
  payload: TPayload;
  timestamp: string;
}

export interface SessionResumeState {
  sessionId: string;
  parentId?: string;
  events: readonly SessionEvent[];
  messages: readonly AnthropicConversationMessage[];
  actionHistory: readonly ActionResultEnvelope[];
  creditHistory: readonly TurnCost[];
  snapshot: VirtualFileSystemSnapshot;
}

export interface SessionStore {
  append(event: SessionEvent): Promise<void>;
  fork(input: { sessionId: string; parentId: string }): Promise<void>;
  resume(sessionId: string): Promise<SessionResumeState>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionEventType(value: unknown): value is SessionEventType {
  return value === "message"
    || value === "action"
    || value === "snapshot"
    || value === "fork"
    || value === "credits";
}

function isConversationMessage(value: unknown): value is AnthropicConversationMessage {
  return isRecord(value)
    && (value.role === "user" || value.role === "assistant")
    && Array.isArray(value.content);
}

function isSnapshot(value: unknown): value is VirtualFileSystemSnapshot {
  return isRecord(value)
    && typeof value.version === "number"
    && Array.isArray(value.files)
    && value.files.every((file) =>
      isRecord(file)
      && typeof file.path === "string"
      && typeof file.content === "string"
    );
}

function isActionResultEnvelope(value: unknown): value is ActionResultEnvelope {
  return isRecord(value)
    && typeof value.actionCallId === "string"
    && typeof value.actionName === "string"
    && typeof value.summary === "string"
    && typeof value.success === "boolean"
    && Array.isArray(value.changedPaths);
}

function isTurnCost(value: unknown): value is TurnCost {
  return isRecord(value)
    && typeof value.inputTokens === "number"
    && typeof value.outputTokens === "number"
    && typeof value.cacheReadTokens === "number"
    && typeof value.cacheWriteTokens === "number"
    && typeof value.estimatedCostUsd === "number";
}

function buildUserPromptMessage(prompt: string): AnthropicConversationMessage {
  return {
    content: [
      {
        text: prompt,
        type: "text",
      },
    ],
    role: "user",
  };
}

function buildSnapshotFromFiles(row: GenerationRow): VirtualFileSystemSnapshot {
  return {
    files: row.files.map((file) => ({
      content: file.content,
      path: file.path,
    })),
    version: 0,
  };
}

function readMetadataParentSessionId(row: GenerationRow): string | undefined {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const engineMetadata = isRecord(metadata.engine) ? metadata.engine : {};

  return typeof engineMetadata.parentSessionId === "string"
    ? engineMetadata.parentSessionId
    : undefined;
}

function readMetadataSnapshot(row: GenerationRow): VirtualFileSystemSnapshot | null {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const engineMetadata = isRecord(metadata.engine) ? metadata.engine : {};

  return isSnapshot(engineMetadata.snapshot) ? engineMetadata.snapshot : null;
}

function parseSessionEvents(
  events: readonly Record<string, unknown>[],
  fallbackSessionId: string,
): SessionEvent[] {
  return events
    .map((event) => {
      if (!isRecord(event) || !isSessionEventType(event.type)) {
        return null;
      }

      return {
        payload: event.payload,
        sessionId:
          typeof event.sessionId === "string" && event.sessionId.length > 0
            ? event.sessionId
            : fallbackSessionId,
        timestamp:
          typeof event.timestamp === "string" && event.timestamp.length > 0
            ? event.timestamp
            : new Date(0).toISOString(),
        type: event.type,
      } satisfies SessionEvent;
    })
    .filter((event): event is SessionEvent => event !== null);
}

export function createSupabaseSessionStore(input: {
  db?: StudioDbClient;
} = {}): SessionStore {
  let cachedDb = input.db;

  async function resolveDb(): Promise<StudioDbClient> {
    if (cachedDb) {
      return cachedDb;
    }

    const { createStudioDbClient } = await import("@beomz-studio/studio-db");
    cachedDb = createStudioDbClient();
    return cachedDb;
  }

  async function requireGeneration(sessionId: string): Promise<GenerationRow> {
    const db = await resolveDb();
    const generation = await db.findGenerationById(sessionId);

    if (!generation) {
      throw new Error(`Generation ${sessionId} does not exist in the studio database.`);
    }

    return generation;
  }

  async function loadGenerationChain(
    sessionId: string,
    seen = new Set<string>(),
  ): Promise<GenerationRow[]> {
    if (seen.has(sessionId)) {
      throw new Error(`Detected a fork cycle while loading session ${sessionId}.`);
    }

    seen.add(sessionId);
    const generation = await requireGeneration(sessionId);
    const parentId = readMetadataParentSessionId(generation);

    if (!parentId) {
      return [generation];
    }

    const parentChain = await loadGenerationChain(parentId, seen);
    return [...parentChain, generation];
  }

  return {
    async append(event) {
      const db = await resolveDb();

      await db.appendGenerationSessionEvent(event.sessionId, {
        payload: event.payload as Record<string, unknown> | unknown[],
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        type: event.type,
      });
    },
    async fork({ parentId, sessionId }) {
      const db = await resolveDb();
      const generation = await requireGeneration(sessionId);
      const metadata = isRecord(generation.metadata) ? generation.metadata : {};
      const engineMetadata = isRecord(metadata.engine) ? metadata.engine : {};

      await db.updateGeneration(sessionId, {
        metadata: {
          ...metadata,
          engine: {
            ...engineMetadata,
            parentSessionId: parentId,
          },
        },
      });

      await this.append({
        payload: {
          parentId,
        },
        sessionId,
        timestamp: new Date().toISOString(),
        type: "fork",
      });
    },
    async resume(sessionId) {
      const generations = await loadGenerationChain(sessionId);
      const messages: AnthropicConversationMessage[] = [];
      const actionHistory: ActionResultEnvelope[] = [];
      const creditHistory: TurnCost[] = [];
      const allEvents: SessionEvent[] = [];
      let parentId: string | undefined;
      let snapshot: VirtualFileSystemSnapshot = {
        files: [],
        version: 0,
      };

      for (const generation of generations) {
        const parsedEvents = parseSessionEvents(generation.session_events, generation.id);
        const generationParentId = readMetadataParentSessionId(generation);

        if (generation.id === sessionId && generationParentId) {
          parentId = generationParentId;
        }

        if (parsedEvents.length === 0) {
          if (generation.prompt.trim().length > 0) {
            messages.push(buildUserPromptMessage(generation.prompt));
          }

          const metadataSnapshot = readMetadataSnapshot(generation);
          snapshot = metadataSnapshot ?? buildSnapshotFromFiles(generation);
          continue;
        }

        for (const event of parsedEvents) {
          allEvents.push(event);

          if (event.type === "message" && isConversationMessage(event.payload)) {
            messages.push(event.payload);
            continue;
          }

          if (event.type === "action" && isActionResultEnvelope(event.payload)) {
            actionHistory.push(event.payload);
            continue;
          }

          if (event.type === "credits" && isTurnCost(event.payload)) {
            creditHistory.push(event.payload);
            continue;
          }

          if (event.type === "snapshot" && isSnapshot(event.payload)) {
            snapshot = event.payload;
            continue;
          }

          if (
            event.type === "fork"
            && isRecord(event.payload)
            && typeof event.payload.parentId === "string"
            && event.sessionId === sessionId
          ) {
            parentId = event.payload.parentId;
          }
        }
      }

      return {
        actionHistory,
        creditHistory,
        events: allEvents,
        messages,
        parentId,
        sessionId,
        snapshot,
      };
    },
  };
}
