import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Moon, Star, Clock } from "lucide-react";

let nextId = 1;

export function App() {
  const [entries, setEntries] = useState([]);
  const [bedtime, setBedtime] = useState("23:00");
  const [wakeup, setWakeup] = useState("07:00");
  const [quality, setQuality] = useState(3);

  const calcHours = useCallback((bed, wake) => {
    const [bh, bm] = bed.split(":").map(Number);
    const [wh, wm] = wake.split(":").map(Number);
    let diff = (wh * 60 + wm) - (bh * 60 + bm);
    if (diff < 0) diff += 24 * 60;
    return diff / 60;
  }, []);

  const addEntry = useCallback(() => {
    const hours = calcHours(bedtime, wakeup);
    setEntries((prev) => [{
      id: nextId++, bedtime, wakeup, quality, hours,
      date: new Date().toLocaleDateString(),
    }, ...prev]);
  }, [bedtime, wakeup, quality, calcHours]);

  const deleteEntry = useCallback((id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const week = entries.slice(0, 7);
    const avgHours = week.reduce((s, e) => s + e.hours, 0) / week.length;
    const avgQuality = week.reduce((s, e) => s + e.quality, 0) / week.length;
    const bestNight = week.reduce((best, e) => e.hours > best.hours ? e : best, week[0]);
    return { avgHours, avgQuality, bestNight, total: entries.length };
  }, [entries]);

  const qualityLabel = ["", "Poor", "Fair", "Good", "Great", "Perfect"];
  const qualityColor = ["", "text-red-400", "text-orange-400", "text-yellow-400", "text-green-400", "text-emerald-400"];

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Moon size={20} /> Sleep Tracker</h1>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
              <span className="text-2xl font-bold text-violet-400">{stats.avgHours.toFixed(1)}</span>
              <p className="text-[10px] text-zinc-500 mt-0.5">Avg hours (7d)</p>
            </div>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
              <div className="flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={12} className={s <= Math.round(stats.avgQuality) ? "text-amber-400" : "text-zinc-700"} fill={s <= Math.round(stats.avgQuality) ? "currentColor" : "none"} />
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5">Avg quality</p>
            </div>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
              <span className="text-2xl font-bold text-white">{stats.total}</span>
              <p className="text-[10px] text-zinc-500 mt-0.5">Nights logged</p>
            </div>
          </div>
        )}

        {entries.length > 1 && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
            <span className="text-xs text-zinc-500 mb-3 block">Last 7 nights</span>
            <div className="flex items-end gap-2 h-20">
              {[...entries].reverse().slice(-7).map((e) => {
                const pct = Math.min(100, (e.hours / 10) * 100);
                return (
                  <div key={e.id} className="flex-1 flex flex-col items-center justify-end" title={e.hours.toFixed(1) + "h"}>
                    <div className={"w-full rounded-t transition-colors " + (e.hours >= 7 ? "bg-violet-500/80" : e.hours >= 5 ? "bg-amber-500/80" : "bg-red-500/80")} style={{ height: Math.max(8, pct) + "%" }} />
                    <span className="text-[9px] text-zinc-600 mt-1">{e.hours.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Log Sleep</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block flex items-center gap-1"><Moon size={10} /> Bedtime</label>
              <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-white text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block flex items-center gap-1"><Clock size={10} /> Wake up</label>
              <input type="time" value={wakeup} onChange={(e) => setWakeup(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-white text-sm outline-none" />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[10px] text-zinc-500 mb-1.5 block">Quality: <span className={qualityColor[quality]}>{qualityLabel[quality]}</span></label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setQuality(s)} className="flex-1">
                  <Star size={20} className={s <= quality ? "text-amber-400 mx-auto" : "text-zinc-700 mx-auto"} fill={s <= quality ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>
          <div className="text-center text-xs text-zinc-500 mb-3">{calcHours(bedtime, wakeup).toFixed(1)} hours of sleep</div>
          <button onClick={addEntry} className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2.5 text-white text-sm font-medium hover:bg-violet-500 transition-colors">
            <Plus size={15} /> Log Night
          </button>
        </div>

        <div className="space-y-1.5">
          {entries.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No sleep data yet</p>}
          {entries.map((e) => (
            <div key={e.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              <Moon size={14} className="text-violet-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{e.hours.toFixed(1)}h</span>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{e.bedtime} → {e.wakeup}</span>
                  <span>·</span>
                  <span className={qualityColor[e.quality]}>{qualityLabel[e.quality]}</span>
                </div>
              </div>
              <span className="text-xs text-zinc-600">{e.date}</span>
              <button onClick={() => deleteEntry(e.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
