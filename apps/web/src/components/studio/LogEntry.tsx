/**
 * Single build log entry row (BEO-89).
 */
import type { ReactNode } from "react";
import { PlanStepIcon } from "./PlanStepIcon";

export interface LogEntryData {
  id: string;
  icon: ReactNode;
  label: string;
  detail: string;
  timestamp: string;
  status: "running" | "done" | "error";
}

interface LogEntryProps {
  entry: LogEntryData;
}

export function LogEntry({ entry }: LogEntryProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <PlanStepIcon
        status={entry.status === "error" ? "error" : entry.status === "done" ? "done" : "running"}
      />
      <span className="shrink-0 text-white/30">{entry.icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-white/60">{entry.label}</span>
        {entry.detail && (
          <span className="ml-2 truncate text-xs text-white/30">{entry.detail}</span>
        )}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-white/20">
        {entry.timestamp}
      </span>
    </div>
  );
}
