import type { StudioFile } from "./studio.js";

export type PreviewProvider = "e2b" | "local";

export type PreviewSessionStatus = "booting" | "running" | "stopped" | "failed";

export interface PreviewSession {
  id: string;
  projectId: string;
  provider: PreviewProvider;
  sandboxId?: string;
  url?: string;
  entryPath: string;
  status: PreviewSessionStatus;
  createdAt: string;
  expiresAt?: string;
}

export interface PreviewPatch {
  sessionId: string;
  files: readonly Pick<StudioFile, "path" | "content" | "kind">[];
  restartRequired: boolean;
  createdAt: string;
}
