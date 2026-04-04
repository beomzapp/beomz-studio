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
  status: "pending" | "running" | "done" | "error";
}

interface LogEntryProps {
  entry: LogEntryData;
}

export function LogEntry({ entry, light }: LogEntryProps & { light?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <PlanStepIcon status={entry.status} />
      <span className={light ? "shrink-0 text-[rgba(0,0,0,0.25)]" : "shrink-0 text-white/30"}>
        {entry.icon}
      </span>
      <div className="min-w-0 flex-1">
        <span
          className={
            entry.status === "pending"
              ? light ? "text-xs font-medium text-[rgba(0,0,0,0.25)]" : "text-xs font-medium text-white/30"
              : light ? "text-xs font-medium text-[rgba(0,0,0,0.6)]" : "text-xs font-medium text-white/60"
          }
        >
          {entry.label}
        </span>
        {entry.detail && (
          <span className={light ? "ml-2 truncate text-xs text-[rgba(0,0,0,0.25)]" : "ml-2 truncate text-xs text-white/30"}>
            {entry.detail}
          </span>
        )}
      </div>
      <span className={light ? "shrink-0 text-[10px] tabular-nums text-[rgba(0,0,0,0.2)]" : "shrink-0 text-[10px] tabular-nums text-white/20"}>
        {entry.timestamp}
      </span>
    </div>
  );
}
