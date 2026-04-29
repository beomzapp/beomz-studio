/**
 * VersionHistoryPanel — BEO-588
 * Slide-out right panel showing project version snapshots.
 * Preview opens a new tab; Restore hot-patches the current WC preview.
 */
import { useCallback, useEffect, useState } from "react";
import { Clock, FileCode, Loader2, Eye, RotateCcw } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  listProjectVersions,
  restoreProjectVersion,
  getProjectVersion,
  type ProjectVersion,
} from "../../lib/api";
import type { StudioFile, StudioFileKind } from "@beomz-studio/contracts";

function toStudioFiles(filesMap: Record<string, string>): StudioFile[] {
  return Object.entries(filesMap).map(([path, content]) => {
    const ext = path.split(".").pop() ?? "txt";
    let kind: StudioFileKind = "component";
    if (/\/(routes|pages|screens)\//.test(path) || /app\.(tsx?|jsx?)$/.test(path)) {
      kind = "route";
    } else if (/\.(css|scss)$/.test(path)) {
      kind = "style";
    } else if (/\.(json)$/.test(path) || /\/(config|data)\//.test(path)) {
      kind = "config";
    }
    return { path, content, kind, language: ext, source: "ai" as const, locked: false };
  });
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function showToast(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-lg bg-[#1a1a1a] px-4 py-2 text-sm text-white shadow-lg animate-[fadeIn_200ms_ease-out]";
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 200ms";
    setTimeout(() => el.remove(), 200);
  }, 2500);
}

interface ConfirmDialogProps {
  versionNumber: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmDialog({ versionNumber, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[360px] rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-2xl">
        <h3 className="text-sm font-semibold text-[#1a1a1a]">Restore to v{versionNumber}?</h3>
        <p className="mt-2 text-xs leading-relaxed text-[#6b7280]">
          Your current state will be auto-saved first so nothing is lost.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-[#e5e5e5] px-3 py-2 text-xs font-medium text-[#6b7280] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a1a] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
          >
            {loading && <Loader2 size={11} className="animate-spin" />}
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="border-b border-[#e5e5e5]/60 px-4 py-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-10 rounded-md bg-[#e5e5e5]" />
        <div className="h-3 w-20 rounded-md bg-[#e5e5e5]" />
      </div>
      <div className="mt-2 h-3 w-4/5 rounded-md bg-[#f3f4f6]" />
      <div className="mt-1 h-3 w-1/3 rounded-md bg-[#f3f4f6]" />
    </div>
  );
}

export interface VersionHistoryPanelProps {
  projectId: string | null;
  /** Called when restore succeeds; ProjectPage applies files to preview */
  onRestoreSuccess: (
    files: StudioFile[],
    restoredVersionNumber: number,
    savedVersionNumber: number,
  ) => void;
  /**
   * BEO-715 2c (BEO-714 fix): bump from the parent on every build-complete
   * event so the panel re-fetches snapshots without forcing the user to
   * close + reopen it. The bug previously was that `fetchVersions` only
   * re-ran on `projectId` change, so a build completing while the panel
   * was open (or before it opened) left it cached at "[]".
   */
  refreshKey?: number;
}

export function VersionHistoryPanel({ projectId, onRestoreSuccess, refreshKey = 0 }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmVersion, setConfirmVersion] = useState<ProjectVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await listProjectVersions(projectId);
      setVersions(data);
    } catch {
      // silently fail if versions endpoint not ready yet
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchVersions();
    // BEO-715 2c: refreshKey is part of the dep set so a parent-driven bump
    // (after every build_summary / done SSE) re-runs fetchVersions without
    // needing to remount the panel.
  }, [fetchVersions, refreshKey]);

  const handlePreview = useCallback((version: ProjectVersion) => {
    if (!projectId) return;
    window.open(
      `/studio/version-preview?projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(version.id)}`,
      "_blank",
    );
  }, [projectId]);

  const handleRestoreConfirm = useCallback(async () => {
    if (!confirmVersion || !projectId) return;
    setRestoring(true);
    try {
      const [result, detail] = await Promise.all([
        restoreProjectVersion(projectId, confirmVersion.id),
        getProjectVersion(projectId, confirmVersion.id),
      ]);
      const studioFiles = toStudioFiles(detail.files);
      setConfirmVersion(null);
      onRestoreSuccess(studioFiles, result.restoredVersionNumber, result.savedVersionNumber);
      // Refresh the list so the newly-created saved version appears
      void fetchVersions();
    } catch {
      setConfirmVersion(null);
      showToast("Restore failed — try again");
    } finally {
      setRestoring(false);
    }
  }, [confirmVersion, projectId, onRestoreSuccess, fetchVersions]);

  if (!projectId) return null;

  return (
    <>
      {confirmVersion && (
        <ConfirmDialog
          versionNumber={confirmVersion.version_number}
          onConfirm={() => void handleRestoreConfirm()}
          onCancel={() => setConfirmVersion(null)}
          loading={restoring}
        />
      )}

      <div className="flex h-full w-full flex-col bg-white">
        {/* Header */}
        <div className="flex flex-none items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-[#9ca3af]" />
            <span className="text-[12px] font-semibold text-[#1a1a1a]">Version history</span>
          </div>
          {!loading && versions.length > 0 && (
            <span className="text-[11px] text-[#9ca3af]">{versions.length} versions</span>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex-1 overflow-hidden">
            {[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && versions.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center">
              <Clock size={28} className="mx-auto mb-2 text-[#d1d5db]" />
              <p className="text-xs font-medium text-[#9ca3af]">No versions yet</p>
              <p className="mt-0.5 text-[11px] text-[#d1d5db]">
                Versions appear after each build
              </p>
            </div>
          </div>
        )}

        {/* Version list */}
        {!loading && versions.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            {versions.map((version, idx) => {
              const isCurrent = idx === 0;
              return (
                <div
                  key={version.id}
                  className={cn(
                    "border-b border-[#e5e5e5]/60 px-4 py-3 transition-colors",
                    isCurrent ? "bg-[#faf9f6]" : "hover:bg-[#faf9f6]",
                  )}
                >
                  {/* Top row: version badge + time */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[12px] font-semibold",
                          isCurrent ? "text-[#F97316]" : "text-[#9ca3af]",
                        )}
                      >
                        v{version.version_number}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-[#FFF7ED] px-1.5 py-0.5 text-[10px] font-medium text-[#F97316]">
                          current
                        </span>
                      )}
                    </div>
                    <span className="flex-none text-[10px] text-[#9ca3af]">
                      {timeAgo(version.created_at)}
                    </span>
                  </div>

                  {/* Label */}
                  <p className="mt-1 line-clamp-1 text-[12px] text-[#374151]">
                    {version.label}
                  </p>

                  {/* Meta */}
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-[#9ca3af]">
                    <FileCode size={10} />
                    <span>
                      {version.file_count} file{version.file_count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Action buttons — only on past versions */}
                  {!isCurrent && (
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <button
                        onClick={() => handlePreview(version)}
                        className="flex items-center gap-1 rounded-md border border-[#e5e5e5] px-2.5 py-1.5 text-[11px] font-medium text-[#6b7280] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a1a]"
                      >
                        <Eye size={11} />
                        Preview
                      </button>
                      <button
                        onClick={() => setConfirmVersion(version)}
                        className="flex items-center gap-1 rounded-md bg-[#F97316] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#EA580C]"
                      >
                        <RotateCcw size={11} />
                        Restore
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
