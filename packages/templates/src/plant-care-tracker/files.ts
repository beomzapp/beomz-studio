import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Droplets, Sun, X, Leaf } from "lucide-react";

let nextId = 20;
const LIGHT = ["Full Sun", "Partial Sun", "Low Light", "Indirect"];

const SAMPLE = [
  { id: 1, name: "Monstera", emoji: "🪴", light: "Indirect", waterDays: 7, lastWatered: "2024-04-08", notes: "Wipe leaves monthly" },
  { id: 2, name: "Snake Plant", emoji: "🌿", light: "Low Light", waterDays: 14, lastWatered: "2024-04-01", notes: "Very low maintenance" },
  { id: 3, name: "Basil", emoji: "🌱", light: "Full Sun", waterDays: 2, lastWatered: "2024-04-09", notes: "Kitchen windowsill" },
  { id: 4, name: "Pothos", emoji: "🍃", light: "Indirect", waterDays: 10, lastWatered: "2024-04-05", notes: "Trailing from shelf" },
];

function daysSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

export function App() {
  const [plants, setPlants] = useState(SAMPLE);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", emoji: "🌱", light: "Indirect", waterDays: "7", notes: "" });

  const addPlant = useCallback(() => {
    if (!form.name.trim()) return;
    setPlants((prev) => [...prev, { id: nextId++, name: form.name.trim(), emoji: form.emoji || "🌱", light: form.light, waterDays: parseInt(form.waterDays) || 7, lastWatered: new Date().toISOString().slice(0, 10), notes: form.notes.trim() }]);
    setForm({ name: "", emoji: "🌱", light: "Indirect", waterDays: "7", notes: "" }); setAdding(false);
  }, [form]);

  const waterPlant = useCallback((id) => {
    setPlants((prev) => prev.map((p) => p.id === id ? { ...p, lastWatered: new Date().toISOString().slice(0, 10) } : p));
  }, []);

  const deletePlant = useCallback((id) => { setPlants((prev) => prev.filter((p) => p.id !== id)); if (selected === id) setSelected(null); }, [selected]);

  const sorted = useMemo(() => {
    return [...plants].sort((a, b) => {
      const aDays = daysSince(a.lastWatered);
      const bDays = daysSince(b.lastWatered);
      const aUrgency = aDays / a.waterDays;
      const bUrgency = bDays / b.waterDays;
      return bUrgency - aUrgency;
    });
  }, [plants]);

  const needsWater = useMemo(() => plants.filter((p) => daysSince(p.lastWatered) >= p.waterDays).length, [plants]);
  const detail = plants.find((p) => p.id === selected);
  const lightIcon = { "Full Sun": "☀️", "Partial Sun": "🌤️", "Low Light": "🌑", Indirect: "💡" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Leaf size={20} className="text-green-400" /> Plant Care</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors">
            <Plus size={14} /> Add Plant
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{plants.length}</span>
            <p className="text-[10px] text-zinc-500">Plants</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className={"text-2xl font-bold " + (needsWater > 0 ? "text-blue-400" : "text-green-400")}>{needsWater}</span>
            <p className="text-[10px] text-zinc-500">Need Water</p>
          </div>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Plant</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-2">
              <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className="w-10 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-center outline-none" maxLength={2} />
              <input placeholder="Plant name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <div className="flex gap-2 mb-2">
              <select value={form.light} onChange={(e) => setForm({ ...form, light: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none">
                {LIGHT.map((l) => <option key={l}>{l}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <Droplets size={13} className="text-blue-400" />
                <input type="number" placeholder="days" value={form.waterDays} onChange={(e) => setForm({ ...form, waterDays: e.target.value })} className="w-14 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-center" />
                <span className="text-xs text-zinc-500">days</span>
              </div>
            </div>
            <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none mb-3" />
            <button onClick={addPlant} className="w-full rounded-xl bg-green-600 py-2.5 text-white text-sm font-medium">Add Plant</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{detail.emoji}</span>
                <div>
                  <h2 className="text-sm font-semibold text-white">{detail.name}</h2>
                  <span className="text-xs text-zinc-500">{lightIcon[detail.light]} {detail.light}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <Droplets size={14} className="mx-auto text-blue-400 mb-1" />
                <span className="text-sm font-bold text-white">Every {detail.waterDays}d</span>
                <p className="text-[10px] text-zinc-500">Water cycle</p>
              </div>
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <span className={"text-sm font-bold " + (daysSince(detail.lastWatered) >= detail.waterDays ? "text-blue-400" : "text-green-400")}>{daysSince(detail.lastWatered)}d ago</span>
                <p className="text-[10px] text-zinc-500">Last watered</p>
              </div>
            </div>
            {detail.notes && <p className="text-sm text-zinc-400 mb-4">{detail.notes}</p>}
            <button onClick={() => waterPlant(detail.id)} className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-white text-sm font-medium hover:bg-blue-500 transition-colors mb-3">
              <Droplets size={15} /> Water Now
            </button>
            <button onClick={() => deletePlant(detail.id)} className="text-xs text-red-400 hover:text-red-300">Remove plant</button>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((p) => {
              const days = daysSince(p.lastWatered);
              const overdue = days >= p.waterDays;
              return (
                <button key={p.id} onClick={() => { setSelected(p.id); setAdding(false); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors">
                  <span className="text-xl">{p.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <p className="text-xs text-zinc-500">{lightIcon[p.light]} {p.light}</p>
                  </div>
                  <div className="text-right">
                    <span className={"text-xs font-medium " + (overdue ? "text-blue-400" : "text-zinc-500")}>{overdue ? "Needs water" : days + "d / " + p.waterDays + "d"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
`,
  },
];
