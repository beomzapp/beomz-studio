/**
 * HistoryPanel — Checkpoint timeline sidebar for BEO-76.
 * Shows generation history with restore + fork actions.
 * Light/cream theme (V1 builder aesthetic).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, RotateCcw, GitBranch, FileCode, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  getCheckpoints,
  restoreCheckpoint,
  forkFromCheckpoint,
  type Checkpoint,
} from "../../lib/checkpoints";
import { supabase } from "../../lib/supabase";

interface HistoryPanelProps {
  projectId: string | null;
  activeGenerationId?: string | null;
  onRestore?: (generationId: string) => void;
  onFork?: (buildId: string, projectId: string) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

export function HistoryPanel({
  projectId,
  activeGenerationId,
  onRestore,
  onFork,
}: HistoryPanelProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<string | null>(null);

  // Fetch checkpoints
  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await getCheckpoints(projectId);
      setCheckpoints(data);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep a stable ref to refresh so the realtime callback always calls
  // the latest version without re-subscribing on every refresh change.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  // Realtime subscription for new generations — depends only on projectId
  // so the channel is created once per project and all postgres_changes
  // listeners are registered before .subscribe() is called.
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`history-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `project_id=eq.${projectId}`,
          schema: "public",
          table: "generations",
        },
        () => void refreshRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId]);

  const handleRestore = useCallback(
    async (checkpoint: Checkpoint) => {
      setRestoringId(checkpoint.id);
      try {
        await restoreCheckpoint(checkpoint.generationId);
        onRestore?.(checkpoint.generationId);
      } catch {
        // Restore endpoint may not exist yet — silently handle
      } finally {
        setRestoringId(null);
      }
    },
    [onRestore],
  );

  const handleFork = useCallback(
    async (checkpoint: Checkpoint) => {
      setForkingId(checkpoint.id);
      try {
        const result = await forkFromCheckpoint(
          checkpoint.generationId,
          checkpoint.prompt,
        );
        onFork?.(result.buildId, result.projectId);
      } catch {
        // Fork endpoint may not exist yet — silently handle
      } finally {
        setForkingId(null);
      }
    },
    [onFork],
  );

  // Empty state
  if (!projectId || (!loading && checkpoints.length === 0)) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-[rgba(0,0,0,0.07)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[rgba(0,0,0,0.3)]">
            <Clock size={14} />
            History
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center">
            <Clock
              size={32}
              className="mx-auto mb-3 text-[rgba(0,0,0,0.12)]"
            />
            <p className="text-sm font-medium text-[rgba(0,0,0,0.3)]">
              No checkpoints yet
            </p>
            <p className="mt-1 text-xs text-[rgba(0,0,0,0.2)]">
              Checkpoints appear after each generation
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Group checkpoints by date
  const grouped = checkpoints.reduce<Record<string, Checkpoint[]>>(
    (acc, cp) => {
      const date = formatDate(cp.createdAt);
      (acc[date] ??= []).push(cp);
      return acc;
    },
    {},
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[rgba(0,0,0,0.07)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[rgba(0,0,0,0.3)]">
            <Clock size={14} />
            History
          </div>
          <span className="rounded-full bg-[rgba(0,0,0,0.04)] px-2 py-0.5 text-[10px] font-medium text-[rgba(0,0,0,0.35)]">
            {checkpoints.length}
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && checkpoints.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-[rgba(0,0,0,0.2)]" />
        </div>
      )}

      {/* Checkpoint list */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([date, cps]) => (
          <div key={date}>
            {/* Date header */}
            <div className="sticky top-0 z-10 bg-[#faf9f6] px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[rgba(0,0,0,0.2)]">
                {date}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-1 px-2 pb-2">
              {cps.map((cp) => {
                const isActive = cp.generationId === activeGenerationId;
                const isRestoring = restoringId === cp.id;
                const isForking = forkingId === cp.id;

                return (
                  <div
                    key={cp.id}
                    className={cn(
                      "group relative rounded-xl border px-3 py-2.5 transition-all",
                      isActive
                        ? "border-[#F97316]/30 bg-[rgba(249,115,22,0.06)]"
                        : "border-[rgba(0,0,0,0.06)] bg-white hover:border-[rgba(0,0,0,0.12)] hover:shadow-sm",
                    )}
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-[3px] top-4 flex items-center">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isActive ? "bg-[#F97316]" : "bg-[rgba(0,0,0,0.15)]",
                        )}
                      />
                    </div>

                    {/* Top row: turn + time */}
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          isActive
                            ? "text-[#F97316]"
                            : "text-[rgba(0,0,0,0.5)]",
                        )}
                      >
                        Turn {cp.turn}
                      </span>
                      <span className="text-[10px] tabular-nums text-[rgba(0,0,0,0.25)]">
                        {formatTime(cp.createdAt)}
                      </span>
                    </div>

                    {/* Prompt */}
                    <p className="mt-1 text-xs leading-relaxed text-[rgba(0,0,0,0.6)]">
                      {truncate(cp.prompt, 80)}
                    </p>

                    {/* Summary if available */}
                    {cp.summary && (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-[rgba(0,0,0,0.35)]">
                        {truncate(cp.summary, 60)}
                      </p>
                    )}

                    {/* Meta row: file count + status */}
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[10px] text-[rgba(0,0,0,0.25)]">
                        <FileCode size={10} />
                        {cp.fileCount} file{cp.fileCount !== 1 ? "s" : ""}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                          cp.status === "completed"
                            ? "bg-emerald-50 text-emerald-600"
                            : cp.status === "running"
                              ? "bg-orange-50 text-orange-500"
                              : "bg-red-50 text-red-500",
                        )}
                      >
                        {cp.status}
                      </span>
                    </div>

                    {/* Action buttons — visible on hover */}
                    <div className="mt-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleRestore(cp)}
                        disabled={isActive || isRestoring}
                        className="flex items-center gap-1 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[10px] font-medium text-[rgba(0,0,0,0.5)] transition-colors hover:border-[rgba(0,0,0,0.15)] hover:text-[rgba(0,0,0,0.7)] disabled:opacity-30"
                      >
                        {isRestoring ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <RotateCcw size={10} />
                        )}
                        Restore
                      </button>
                      <button
                        onClick={() => handleFork(cp)}
                        disabled={isForking}
                        className="flex items-center gap-1 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[10px] font-medium text-[rgba(0,0,0,0.5)] transition-colors hover:border-[#F97316]/30 hover:text-[#F97316] disabled:opacity-30"
                      >
                        {isForking ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <GitBranch size={10} />
                        )}
                        Fork
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
