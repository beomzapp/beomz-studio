import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, CreditCard, Calendar, X, DollarSign } from "lucide-react";

let nextId = 10;
const CATEGORIES = ["Streaming", "Software", "Cloud", "Music", "News", "Other"];
const CYCLES = ["Monthly", "Yearly"];
const SAMPLE = [
  { id: 1, name: "Netflix", cost: 15.49, cycle: "Monthly", category: "Streaming", renewal: "15th", color: "bg-red-600" },
  { id: 2, name: "Spotify", cost: 10.99, cycle: "Monthly", category: "Music", renewal: "1st", color: "bg-green-600" },
  { id: 3, name: "GitHub Pro", cost: 4.00, cycle: "Monthly", category: "Software", renewal: "22nd", color: "bg-zinc-600" },
  { id: 4, name: "Figma", cost: 12.00, cycle: "Monthly", category: "Software", renewal: "5th", color: "bg-purple-600" },
  { id: 5, name: "iCloud+", cost: 2.99, cycle: "Monthly", category: "Cloud", renewal: "10th", color: "bg-blue-600" },
  { id: 6, name: "ChatGPT Plus", cost: 20.00, cycle: "Monthly", category: "Software", renewal: "18th", color: "bg-emerald-600" },
];

export function App() {
  const [subs, setSubs] = useState(SAMPLE);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", cost: "", cycle: "Monthly", category: "Software", renewal: "" });

  const addSub = useCallback(() => {
    const cost = parseFloat(form.cost);
    if (!form.name.trim() || !cost) return;
    const colors = ["bg-red-600", "bg-blue-600", "bg-green-600", "bg-purple-600", "bg-amber-600", "bg-pink-600"];
    setSubs((prev) => [...prev, { id: nextId++, name: form.name.trim(), cost, cycle: form.cycle, category: form.category, renewal: form.renewal || "1st", color: colors[prev.length % colors.length] }]);
    setForm({ name: "", cost: "", cycle: "Monthly", category: "Software", renewal: "" });
    setAdding(false);
  }, [form]);

  const deleteSub = useCallback((id) => { setSubs((prev) => prev.filter((s) => s.id !== id)); }, []);

  const monthly = useMemo(() => subs.reduce((s, sub) => s + (sub.cycle === "Yearly" ? sub.cost / 12 : sub.cost), 0), [subs]);
  const yearly = useMemo(() => monthly * 12, [monthly]);

  const byCategory = useMemo(() => {
    const map = {};
    for (const sub of subs) {
      const cost = sub.cycle === "Yearly" ? sub.cost / 12 : sub.cost;
      map[sub.category] = (map[sub.category] || 0) + cost;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [subs]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><CreditCard size={20} /> Subscriptions</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign size={14} className="text-rose-400" /><span className="text-xs text-zinc-500">Monthly</span></div>
            <span className="text-2xl font-bold text-white">\${monthly.toFixed(2)}</span>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-1"><Calendar size={14} className="text-zinc-500" /><span className="text-xs text-zinc-500">Yearly</span></div>
            <span className="text-2xl font-bold text-white">\${yearly.toFixed(2)}</span>
          </div>
        </div>

        {byCategory.length > 1 && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
            <span className="text-xs text-zinc-500 mb-2 block">By Category</span>
            <div className="flex gap-1 h-3 rounded-full overflow-hidden">
              {byCategory.map(([cat, amt]) => (
                <div key={cat} className="bg-rose-500 first:rounded-l-full last:rounded-r-full" style={{ width: (amt / monthly * 100) + "%", opacity: 0.4 + (amt / monthly) * 0.6 }} title={cat + ": $" + amt.toFixed(2)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {byCategory.map(([cat, amt]) => (
                <span key={cat} className="text-[10px] text-zinc-500">{cat}: \${amt.toFixed(2)}/mo</span>
              ))}
            </div>
          </div>
        )}

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Subscription</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <input placeholder="Service name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <div className="flex gap-2">
                <input type="number" placeholder="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
                <select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })} className="rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                  {CYCLES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input placeholder="Renewal day" value={form.renewal} onChange={(e) => setForm({ ...form, renewal: e.target.value })} className="w-28 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              </div>
            </div>
            <button onClick={addSub} className="w-full mt-3 rounded-xl bg-rose-600 py-2.5 text-white text-sm font-medium hover:bg-rose-500 transition-colors">Add Subscription</button>
          </div>
        )}

        <div className="space-y-2">
          {subs.map((sub) => (
            <div key={sub.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              <div className={"h-3 w-3 rounded-full flex-shrink-0 " + sub.color} />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{sub.name}</span>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{sub.category}</span><span>·</span><span>Renews {sub.renewal}</span>
                </div>
              </div>
              <span className="text-sm font-medium text-white">\${sub.cost.toFixed(2)}<span className="text-xs text-zinc-500">/{sub.cycle === "Yearly" ? "yr" : "mo"}</span></span>
              <button onClick={() => deleteSub(sub.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={14} /></button>
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
