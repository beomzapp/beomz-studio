/**
 * Clean discriminated union for all chat messages in the builder.
 * BEO-363: replaces the stringly-typed ChatMessage interface in ChatPanel.tsx.
 * BEO-391: building message carries preamble, checklist, optional merged summary + next steps.
 */
export type ChatChecklistStatus = "pending" | "active" | "done" | "failed";

export type ChatMessage =
  | { id: string; type: "user"; content: string; timestamp: Date }
  | { id: string; type: "thinking" }
  | { id: string; type: "question_answer"; content: string; streaming: boolean }
  | { id: string; type: "pre_build_ack"; content: string }
  | {
      id: string;
      type: "building";
      phase?: string;
      /** Immediate copy from pre_build_ack SSE — lives in the same card as the checklist (BEO-392). */
      ackMessage?: string;
      preamble?: { restatement: string; bullets: string[] };
      /** True when preamble text is the static fallback (not from Haiku). */
      preambleIsFallback?: boolean;
      checklist?: { id: string; label: string; status: ChatChecklistStatus }[];
      summary?: {
        content: string;
        filesChanged: string[];
        durationMs?: number;
        creditsUsed?: number;
      };
      nextSteps?: { label: string; prompt: string }[];
      filesWritten?: number;
      totalFiles?: number;
      buildStartedAt?: number;
      buildFrozenAt?: number;
    }
  | {
      id: string;
      type: "build_summary";
      content: string;
      filesChanged: string[];
      durationMs?: number;
      creditsUsed?: number;
      nextSteps?: { label: string; prompt: string }[];
    }
  | { id: string; type: "clarifying_question"; content: string }
  | { id: string; type: "error"; content: string; code?: string }
  | { id: string; type: "server_restarting" }
  /** BEO-396: Chat mode — Beomz conversational reply (B avatar, flowing text, no checklist). */
  | { id: string; type: "chat_response"; content: string; streaming?: boolean }
  /** BEO-182: Image intent classification confirmation card. */
  | {
      id: string;
      type: "image_intent";
      intent: "logo" | "reference" | "error" | "theme" | "general";
      description: string;
      imageUrl: string;
    };
