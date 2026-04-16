/**
 * Clean discriminated union for all chat messages in the builder.
 * BEO-363: replaces the stringly-typed ChatMessage interface in ChatPanel.tsx.
 */
export type ChatMessage =
  | { id: string; type: "user"; content: string; timestamp: Date }
  | { id: string; type: "question_answer"; content: string; streaming: boolean }
  | { id: string; type: "pre_build_ack"; content: string }
  | { id: string; type: "building"; phase?: string; filesWritten?: number; totalFiles?: number }
  | { id: string; type: "build_summary"; content: string; filesChanged: string[] }
  | { id: string; type: "clarifying_question"; content: string }
  | { id: string; type: "error"; content: string; code?: string }
  | { id: string; type: "server_restarting" };
