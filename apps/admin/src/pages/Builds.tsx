import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  fetchAdminBuilds,
  fetchAdminBuildStats,
  type AdminBuild,
  type AdminBuildStats,
} from "../lib/api.ts";
import { useAuthToken } from "../lib/useAuthToken.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  building: "bg-amber-100 text-amber-700",
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function StatusPill({ status }: { status: string | undefined }) {
  const style = STATUS_STYLES[status ?? ""] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {status ?? "unknown"}
    </span>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-5 py-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}

// ── Build row ─────────────────────────────────────────────────────────────────

function BuildRow({ build }: { build: AdminBuild }) {
  const [expanded, setExpanded] = useState(false);
  const isFailed = build.status === "failed";

  return (
    <>
      <tr
        className={`border-b border-slate-100 last:border-b-0 transition-colors ${
          isFailed ? "hover:bg-red-50 cursor-pointer" : "hover:bg-slate-50"
        }`}
        onClick={() => { if (isFailed) setExpanded(e => !e); }}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {isFailed && (
              <span className="text-slate-400 shrink-0">
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            )}
            <span className="text-sm text-slate-700 truncate max-w-[240px]">{build.user_email ?? "—"}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <StatusPill status={build.status} />
        </td>
        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
          {formatDate(build.started_at)}
        </td>
        <td className="px-4 py-3 text-sm font-mono text-slate-600 whitespace-nowrap">
          {formatDuration(build.duration_ms)}
        </td>
        <td className="px-4 py-3 text-sm font-mono text-slate-600 text-right whitespace-nowrap">
          {formatTokens(build.tokens_used)}
        </td>
      </tr>
      {isFailed && expanded && build.error_reason && (
        <tr className="bg-red-50 border-b border-slate-100">
          <td colSpan={5} className="px-4 py-3 pl-10">
            <p className="text-xs font-medium text-red-600 mb-1">Error reason</p>
            <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-words">
              {build.error_reason}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Shared table shell ────────────────────────────────────────────────────────

function BuildTable({
  rows,
  loading,
  error,
  emptyMsg,
}: {
  rows: AdminBuild[];
  loading: boolean;
  error: string | null;
  emptyMsg: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                User
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Status
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Started
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Duration
              </th>
              <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Tokens
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-red-500">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  {emptyMsg}
                </td>
              </tr>
            ) : (
              rows.map(b => <BuildRow key={b.id} build={b} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

export default function BuildsPage() {
  const token = useAuthToken();

  const [stats, setStats] = useState<AdminBuildStats | null>(null);
  const [inFlight, setInFlight] = useState<AdminBuild[]>([]);
  const [recent, setRecent] = useState<AdminBuild[]>([]);

  const [statsLoading, setStatsLoading] = useState(true);
  const [buildsLoading, setBuildsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchAdminBuildStats(token);
      setStats(data);
    } catch (e) {
      // Stats failure is non-fatal; don't block the table
      console.error("Failed to load build stats", e);
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  const loadBuilds = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setBuildsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminBuilds(token);
      setInFlight(data.in_flight ?? []);
      setRecent(data.recent ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load builds");
    } finally {
      setBuildsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadStats();
    void loadBuilds(false);

    intervalRef.current = setInterval(() => {
      void loadBuilds(true);
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, loadStats, loadBuilds]);

  const successRate =
    stats && stats.success_rate != null
      ? `${stats.success_rate.toFixed(1)}%`
      : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Builds</h2>
        <p className="text-sm text-slate-500 mt-0.5">Real-time build monitor</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Today"
          value={statsLoading ? "…" : (stats?.today_total ?? "—")}
        />
        <StatCard
          label="Success"
          value={statsLoading ? "…" : (stats?.today_success ?? "—")}
        />
        <StatCard
          label="Failed"
          value={statsLoading ? "…" : (stats?.today_failed ?? "—")}
        />
        <StatCard
          label="Success rate"
          value={statsLoading ? "…" : successRate}
        />
      </div>

      {/* In-flight section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-700">In flight</h3>
          {inFlight.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              {inFlight.length}
            </span>
          )}
          <span className="text-xs text-slate-400 ml-auto">polls every 10s</span>
        </div>
        <BuildTable
          rows={inFlight}
          loading={buildsLoading}
          error={error}
          emptyMsg="No builds in flight"
        />
      </div>

      {/* Recent section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Recent</h3>
          {!buildsLoading && recent.length > 0 && (
            <span className="text-xs text-slate-400">{recent.length} builds</span>
          )}
        </div>
        <BuildTable
          rows={recent}
          loading={buildsLoading}
          error={null}
          emptyMsg="No recent builds"
        />
      </div>
    </div>
  );
}
