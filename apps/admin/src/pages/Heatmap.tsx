import { useState, useEffect, useCallback, useRef } from "react";
import { ComposableMap, Geographies, Geography, Marker, type Geography as GeoType } from "react-simple-maps";
import { Globe, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.ts";
import { fetchAdminHeatmap, type HeatmapEntry, type HeatmapRange } from "../lib/api.ts";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const RANGES: { label: string; value: HeatmapRange }[] = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "All time", value: "all" },
];

const POLL_INTERVAL_MS = 30_000;

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function calcRadius(count: number, maxCount: number): number {
  if (maxCount === 0) return 4;
  return 4 + ((count / maxCount) ** 0.6) * 26;
}

function calcOpacity(count: number, maxCount: number): number {
  if (maxCount === 0) return 0.3;
  return 0.3 + ((count / maxCount) ** 0.5) * 0.6;
}

interface Tooltip {
  x: number;
  y: number;
  entry: HeatmapEntry;
}

export default function HeatmapPage() {
  const [range, setRange] = useState<HeatmapRange>("24h");
  const [data, setData] = useState<HeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { setError("Not authenticated"); return; }
      const entries = await fetchAdminHeatmap(token, range);
      setData(entries);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load heatmap");
    } finally {
      setLoading(false);
    }
  }, [range]);

  // Initial load + on range change
  useEffect(() => {
    void load(true);
  }, [load]);

  // Live polling
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => { void load(false); }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const maxCount = data.reduce((m, e) => Math.max(m, e.count), 0);
  const totalLogins = data.reduce((s, e) => s + e.count, 0);
  const uniqueCountries = data.length;

  function handleMarkerMouseEnter(e: React.MouseEvent<SVGCircleElement>, entry: HeatmapEntry) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      entry,
    });
  }

  function handleMarkerMouseMove(e: React.MouseEvent<SVGCircleElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !tooltip) return;
    setTooltip(t => t ? { ...t, x: e.clientX - rect.left, y: e.clientY - rect.top } : t);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Globe size={18} className="text-slate-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Login Heatmap</h2>
            {lastUpdated && (
              <p className="text-xs text-slate-400 mt-0.5">
                Last updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Range toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
            {RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  range === r.value
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4">
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
            <span className="text-orange-500 text-sm font-bold">↑</span>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Logins</p>
            <p className="text-xl font-semibold text-slate-800">
              {loading ? "—" : totalLogins.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
            <Globe size={14} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Countries</p>
            <p className="text-xl font-semibold text-slate-800">
              {loading ? "—" : uniqueCountries.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Poll indicator */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live · polls every 30s
        </div>
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        className="relative bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 min-h-[420px]"
        onMouseLeave={() => setTooltip(null)}
      >
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <p className="text-sm text-red-500 bg-white px-4 py-2 rounded-lg border border-red-100 shadow">
              {error}
            </p>
          </div>
        )}

        {loading && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              Loading map…
            </div>
          </div>
        )}

        <ComposableMap
          projectionConfig={{ scale: 147, center: [10, 10] }}
          style={{ width: "100%", height: "100%" }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: GeoType[] }) =>
              geographies.map((geo: GeoType) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#e8e8e8"
                  stroke="#ffffff"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#d8d8d8" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {data.map(entry => {
            const r = calcRadius(entry.count, maxCount);
            const opacity = calcOpacity(entry.count, maxCount);
            return (
              <Marker
                key={entry.country_code}
                coordinates={[entry.lng, entry.lat]}
              >
                <circle
                  r={r}
                  fill="#F97316"
                  fillOpacity={opacity}
                  stroke="#F97316"
                  strokeOpacity={Math.min(opacity + 0.15, 1)}
                  strokeWidth={1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={e => handleMarkerMouseEnter(e, entry)}
                  onMouseMove={e => handleMarkerMouseMove(e)}
                  onMouseLeave={() => setTooltip(null)}
                />
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 36,
              transform: "translateY(-50%)",
              whiteSpace: "nowrap",
            }}
          >
            <p className="font-semibold">{tooltip.entry.country_name}</p>
            <p className="text-slate-300">{tooltip.entry.count.toLocaleString()} login{tooltip.entry.count !== 1 ? "s" : ""}</p>
          </div>
        )}
      </div>

      {/* Country list (top 10) */}
      {!loading && data.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Top Countries
            </p>
          </div>
          <div className="divide-y divide-slate-50">
            {[...data]
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
              .map((entry, i) => (
                <div key={entry.country_code} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="text-sm text-slate-700 truncate">{entry.country_name}</span>
                    <span className="text-xs text-slate-400 font-mono shrink-0 ml-auto">
                      {entry.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-orange-400 rounded-full"
                      style={{ width: `${(entry.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
