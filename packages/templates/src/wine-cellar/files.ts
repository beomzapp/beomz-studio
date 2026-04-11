import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Star, Search, Wine, X } from "lucide-react";

let nextId = 20;
const TYPES = ["Red", "White", "Rose", "Sparkling", "Dessert"];

const SAMPLE = [
  { id: 1, name: "Chateau Margaux 2015", type: "Red", region: "Bordeaux, France", rating: 5, notes: "Exceptional depth, dark fruit, long finish", year: 2015, qty: 2 },
  { id: 2, name: "Cloudy Bay Sauvignon Blanc", type: "White", region: "Marlborough, NZ", rating: 4, notes: "Crisp citrus, tropical notes", year: 2022, qty: 4 },
  { id: 3, name: "Veuve Clicquot Brut", type: "Sparkling", region: "Champagne, France", rating: 4, notes: "Toast and brioche, fine bubbles", year: 0, qty: 3 },
  { id: 4, name: "Whispering Angel", type: "Rose", region: "Provence, France", rating: 3, notes: "Light and refreshing, summer sipper", year: 2023, qty: 6 },
];

export function App() {
  const [wines, setWines] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", type: "Red", region: "", rating: 4, notes: "", year: "", qty: "1" });
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    let list = wines;
    if (typeFilter !== "All") list = list.filter((w) => w.type === typeFilter);
    if (search) list = list.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()) || w.region.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [wines, search, typeFilter]);

  const stats = useMemo(() => ({
    total: wines.reduce((s, w) => s + w.qty, 0),
    unique: wines.length,
    avgRating: wines.length > 0 ? (wines.reduce((s, w) => s + w.rating, 0) / wines.length).toFixed(1) : "0",
  }), [wines]);

  const addWine = useCallback(() => {
    if (!form.name.trim()) return;
    setWines((prev) => [...prev, { id: nextId++, name: form.name.trim(), type: form.type, region: form.region.trim(), rating: form.rating, notes: form.notes.trim(), year: parseInt(form.year) || 0, qty: parseInt(form.qty) || 1 }]);
    setForm({ name: "", type: "Red", region: "", rating: 4, notes: "", year: "", qty: "1" });
    setAdding(false);
  }, [form]);

  const deleteWine = useCallback((id) => { setWines((prev) => prev.filter((w) => w.id !== id)); if (selected === id) setSelected(null); }, [selected]);

  const detail = wines.find((w) => w.id === selected);
  const typeColor = { Red: "bg-red-600", White: "bg-amber-200", Rose: "bg-pink-400", Sparkling: "bg-yellow-300", Dessert: "bg-amber-600" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Wine size={20} className="text-red-400" /> Wine Cellar</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{stats.total}</span>
            <p className="text-[10px] text-zinc-500">Bottles</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{stats.unique}</span>
            <p className="text-[10px] text-zinc-500">Wines</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <div className="flex justify-center items-center gap-1">
              <Star size={14} className="text-amber-400" fill="currentColor" />
              <span className="text-2xl font-bold text-white">{stats.avgRating}</span>
            </div>
            <p className="text-[10px] text-zinc-500">Avg Rating</p>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search wines..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {["All", ...TYPES].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className={"rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all " + (typeFilter === t ? "bg-red-800 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              {t}
            </button>
          ))}
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Add Wine</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <input placeholder="Wine name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <div className="flex gap-2">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <input placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="w-20 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none text-center" />
                <input placeholder="Qty" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="w-14 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none text-center" />
              </div>
              <input placeholder="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Rating</label>
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, rating: s })}><Star size={18} className={s <= form.rating ? "text-amber-400" : "text-zinc-700"} fill={s <= form.rating ? "currentColor" : "none"} /></button>
                ))}</div>
              </div>
              <textarea placeholder="Tasting notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none" />
            </div>
            <button onClick={addWine} className="w-full mt-3 rounded-xl bg-red-800 py-2.5 text-white text-sm font-medium hover:bg-red-700 transition-colors">Add to Cellar</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">{detail.name}</h2>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className={"h-3 w-3 rounded-full " + (typeColor[detail.type] || "bg-zinc-500")} />
              <span className="text-xs text-zinc-400">{detail.type}</span>
              {detail.year > 0 && <span className="text-xs text-zinc-500">{detail.year}</span>}
              <span className="text-xs text-zinc-500">{detail.region}</span>
            </div>
            <div className="flex gap-0.5 mb-3">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={16} className={s <= detail.rating ? "text-amber-400" : "text-zinc-700"} fill={s <= detail.rating ? "currentColor" : "none"} />)}</div>
            {detail.notes && <p className="text-sm text-zinc-400 mb-3">{detail.notes}</p>}
            <p className="text-xs text-zinc-500 mb-3">{detail.qty} bottle{detail.qty !== 1 ? "s" : ""}</p>
            <button onClick={() => deleteWine(detail.id)} className="text-xs text-red-400 hover:text-red-300">Remove from cellar</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No wines found</p>}
            {filtered.map((w) => (
              <button key={w.id} onClick={() => { setSelected(w.id); setAdding(false); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors">
                <div className={"h-3 w-3 rounded-full flex-shrink-0 " + (typeColor[w.type] || "bg-zinc-500")} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{w.name}</span>
                  <p className="text-xs text-zinc-500">{w.region}{w.year > 0 ? " · " + w.year : ""}</p>
                </div>
                <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={9} className={s <= w.rating ? "text-amber-400" : "text-zinc-800"} fill={s <= w.rating ? "currentColor" : "none"} />)}</div>
                <span className="text-xs text-zinc-600">{w.qty}</span>
              </button>
            ))}
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
