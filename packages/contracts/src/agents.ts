export type AgentRole = "planner" | "builder" | "refiner" | "reviewer" | "image";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentDefinition {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  model: string;
  supportedOperations: readonly string[];
  maxConcurrentRuns: number;
}

export interface AgentRun {
  id: string;
  agentId: string;
  projectId: string;
  operationId: string;
  status: AgentRunStatus;
  startedAt?: string;
  finishedAt?: string;
  outputPaths: readonly string[];
  error?: string;
}
