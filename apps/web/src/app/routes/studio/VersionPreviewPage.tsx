/**
 * VersionPreviewPage — BEO-588
 * Full-screen read-only preview of a project version snapshot.
 * Opened in a new tab from VersionHistoryPanel.
 * URL: /studio/version-preview?projectId=X&versionId=Y
 */
import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { PreviewPane } from "../../../components/studio/PreviewPane";
import { getProjectVersion, type ProjectVersionDetail } from "../../../lib/api";
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

export function VersionPreviewPage() {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("projectId") ?? "";
  const versionId = params.get("versionId") ?? "";

  const [version, setVersion] = useState<ProjectVersionDetail | null>(null);
  const [files, setFiles] = useState<StudioFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !versionId) {
      setError("Missing projectId or versionId.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const detail = await getProjectVersion(projectId, versionId);
        setVersion(detail);
        setFiles(toStudioFiles(detail.files));
      } catch {
        setError("Failed to load version. Please close this tab and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, versionId]);

  const labelTruncated =
    version?.label && version.label.length > 60
      ? version.label.slice(0, 59) + "…"
      : (version?.label ?? "");

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a]">
      {/* Fixed dark banner */}
      <div
        className="flex flex-none items-center justify-between border-b border-white/10 px-4"
        style={{ height: 48, background: "#1a1a1a" }}
      >
        <div className="flex items-center gap-2 text-sm text-white/80">
          <Clock size={14} className="text-white/50" />
          {version ? (
            <span>
              Viewing{" "}
              <span className="font-semibold text-white">v{version.version_number}</span>
              {labelTruncated ? ` — ${labelTruncated}` : ""}
            </span>
          ) : (
            <span className="text-white/50">Loading version…</span>
          )}
        </div>
        <button
          onClick={() => window.close()}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#F97316] transition-colors hover:bg-white/10"
        >
          <X size={13} />
          Close tab
        </button>
      </div>

      {/* Content area */}
      <div className="min-h-0 flex-1">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
              <span className="text-sm text-white/50">Loading preview…</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && files && (
          <PreviewPane
            files={files}
            generationId={versionId}
            isAiCustomising={false}
            previewEntryPath={null}
            project={null}
            refreshToken={0}
            buildFailed={false}
            isBuildInProgress={false}
          />
        )}
      </div>
    </div>
  );
}
