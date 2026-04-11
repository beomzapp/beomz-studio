import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Target, TrendingDown, TrendingUp, Scale } from "lucide-react";

let nextId = 1;

export function App() {
  const [entries, setEntries] = useState([]);
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("165");
  const [unit, setUnit] = useState("lbs");

  const addEntry = useCallback(() => {
    const val = parseFloat(weight);
    if (!val) return;
    setEntries((prev) => [{ id: nextId++, weight: val, date: new Date().toLocaleDateString(), ts: Date.now() }, ...prev]);
    setWeight("");
  }, [weight]);

  const deleteEntry = useCallback((id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const current = entries[0].weight;
    const goalVal = parseFloat(goal) || 0;
    const diff = current - goalVal;
    const sorted = [...entries].sort((a, b) => a.ts - b.ts);
    const first = sorted[0].weight;
    const totalChange = current - first;
    const avg = entries.reduce((s, e) => s + e.weight, 0) / entries.length;
    return { current, diff, totalChange, avg, goalVal };
  }, [entries, goal]);

  const chartEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.ts - b.ts).slice(-14);
  }, [entries]);

  const chartMin = chartEntries.length > 0 ? Math.min(...chartEntries.map((e) => e.weight)) - 2 : 0;
  const chartMax = chartEntries.length > 0 ? Math.max(...chartEntries.map((e) => e.weight)) + 2 : 100;
  const chartRange = chartMax - chartMin || 1;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Scale size={20} /> Weight Tracker</h1>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <span className="text-xs text-zinc-500">Current</span>
            <p className="text-2xl font-bold text-white mt-1">{stats ? stats.current : "—"} <span className="text-sm text-zinc-500">{unit}</span></p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <span className="text-xs text-zinc-500 flex items-center gap-1"><Target size={10} /> Goal</span>
            <div className="flex items-center gap-1 mt-1">
              <input type="number" value={goal} onChange={(e) => setGoal(e.target.value)} className="w-20 bg-transparent text-2xl font-bold text-emerald-400 outline-none" />
              <span className="text-sm text-zinc-500">{unit}</span>
            </div>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl bg-zinc-900 border border-white/5 p-3 text-center">
              <span className={"flex items-center justify-center gap-1 text-sm font-semibold " + (stats.diff <= 0 ? "text-green-400" : "text-red-400")}>
                {stats.diff <= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                {Math.abs(stats.diff).toFixed(1)}
              </span>
              <p className="text-[10px] text-zinc-600 mt-0.5">To goal</p>
            </div>
            <div className="rounded-xl bg-zinc-900 border border-white/5 p-3 text-center">
              <span className={"text-sm font-semibold " + (stats.totalChange <= 0 ? "text-green-400" : "text-red-400")}>
                {stats.totalChange > 0 ? "+" : ""}{stats.totalChange.toFixed(1)}
              </span>
              <p className="text-[10px] text-zinc-600 mt-0.5">Total change</p>
            </div>
            <div className="rounded-xl bg-zinc-900 border border-white/5 p-3 text-center">
              <span className="text-sm font-semibold text-white">{stats.avg.toFixed(1)}</span>
              <p className="text-[10px] text-zinc-600 mt-0.5">Average</p>
            </div>
          </div>
        )}

        {chartEntries.length > 1 && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
            <span className="text-xs text-zinc-500 mb-3 block">Trend (last 14)</span>
            <div className="flex items-end gap-1 h-24">
              {chartEntries.map((e, i) => {
                const pct = ((e.weight - chartMin) / chartRange) * 100;
                return (
                  <div key={e.id} className="flex-1 flex flex-col justify-end" title={e.weight + " " + unit}>
                    <div className="rounded-t bg-emerald-500/80 hover:bg-emerald-400 transition-colors" style={{ height: Math.max(4, pct) + "%" }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
          <form onSubmit={(e) => { e.preventDefault(); addEntry(); }} className="flex gap-2">
            <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={"Weight (" + unit + ")"} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none" />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-xl bg-zinc-800 border border-white/5 px-2 py-2.5 text-sm text-white outline-none">
              <option value="lbs">lbs</option>
              <option value="kg">kg</option>
            </select>
            <button type="submit" className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-emerald-500 transition-colors">
              <Plus size={15} /> Log
            </button>
          </form>
        </div>

        <div className="space-y-1.5">
          {entries.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No entries — log your weight above</p>}
          {entries.map((e) => (
            <div key={e.id} className="group flex items-center justify-between rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              <span className="text-sm text-zinc-500">{e.date}</span>
              <span className="text-sm font-medium text-white">{e.weight} {unit}</span>
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
