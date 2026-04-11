import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, FileText, Check, Clock, X } from "lucide-react";

let nextId = 10;
const CATEGORIES = ["Travel", "Meals", "Lodging", "Transport", "Supplies", "Other"];
const STATUSES = ["Draft", "Submitted", "Approved", "Rejected"];

export function App() {
  const [reportName, setReportName] = useState("Q2 Business Trip");
  const [status, setStatus] = useState("Draft");
  const [entries, setEntries] = useState([
    { id: 1, date: "2024-04-08", description: "Flight to NYC", category: "Travel", amount: 385 },
    { id: 2, date: "2024-04-08", description: "Taxi to hotel", category: "Transport", amount: 45 },
    { id: 3, date: "2024-04-09", description: "Client dinner", category: "Meals", amount: 127.50 },
    { id: 4, date: "2024-04-09", description: "Hotel (2 nights)", category: "Lodging", amount: 420 },
    { id: 5, date: "2024-04-10", description: "Office supplies", category: "Supplies", amount: 32 },
  ]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: "", description: "", category: "Travel", amount: "" });

  const total = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries]);
  const byCategory = useMemo(() => {
    const map = {};
    for (const e of entries) map[e.category] = (map[e.category] || 0) + e.amount;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const addEntry = useCallback(() => {
    const amt = parseFloat(form.amount);
    if (!form.description.trim() || !amt) return;
    setEntries((prev) => [...prev, { id: nextId++, date: form.date || new Date().toISOString().slice(0, 10), description: form.description.trim(), category: form.category, amount: amt }]);
    setForm({ date: "", description: "", category: "Travel", amount: "" }); setAdding(false);
  }, [form]);

  const removeEntry = useCallback((id) => { setEntries((prev) => prev.filter((e) => e.id !== id)); }, []);
  const fmt = (n) => "$" + n.toFixed(2);
  const statusColor = { Draft: "bg-zinc-700 text-zinc-300", Submitted: "bg-blue-600/20 text-blue-400", Approved: "bg-green-600/20 text-green-400", Rejected: "bg-red-600/20 text-red-400" };
  const catColor = { Travel: "bg-blue-500", Meals: "bg-orange-500", Lodging: "bg-purple-500", Transport: "bg-cyan-500", Supplies: "bg-amber-500", Other: "bg-zinc-500" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><FileText size={20} /> Expense Report</h1>
          <span className={"rounded-full px-2.5 py-1 text-xs font-medium " + statusColor[status]}>{status}</span>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
          <input value={reportName} onChange={(e) => setReportName(e.target.value)} className="w-full bg-transparent text-lg font-medium text-white outline-none mb-2" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Status:</span>
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={"rounded-full px-2 py-0.5 text-[10px] font-medium transition-all " + (status === s ? statusColor[s] : "bg-zinc-800 text-zinc-600 hover:text-zinc-400")}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 text-center">
            <span className="text-3xl font-bold text-white">{fmt(total)}</span>
            <p className="text-[10px] text-zinc-500 mt-1">Total Amount</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <span className="text-xs text-zinc-500 mb-2 block">By Category</span>
            <div className="space-y-1">
              {byCategory.map(([cat, amt]) => (
                <div key={cat} className="flex items-center gap-2 text-xs">
                  <div className={"h-2 w-2 rounded-full " + (catColor[cat] || "bg-zinc-500")} />
                  <span className="flex-1 text-zinc-400">{cat}</span>
                  <span className="text-zinc-300">{fmt(amt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-zinc-400">Entries ({entries.length})</span>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"><Plus size={13} /> Add</button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white">New Entry</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-2">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-36 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none" />
              <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <div className="flex gap-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-24 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button onClick={addEntry} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white font-medium">Add</button>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900 border border-white/5 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-white/5">
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500">Date</th>
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500">Description</th>
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500">Category</th>
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 text-right">Amount</th>
              <th className="w-8" />
            </tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-white/5 last:border-0 group hover:bg-zinc-800/30">
                  <td className="px-4 py-2.5 text-zinc-500">{e.date}</td>
                  <td className="px-4 py-2.5 text-white">{e.description}</td>
                  <td className="px-4 py-2.5"><span className="flex items-center gap-1.5"><span className={"h-2 w-2 rounded-full " + (catColor[e.category] || "bg-zinc-500")} /><span className="text-zinc-400">{e.category}</span></span></td>
                  <td className="px-4 py-2.5 text-right text-zinc-300">{fmt(e.amount)}</td>
                  <td className="px-2"><button onClick={() => removeEntry(e.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-white/5">
              <td colSpan={3} className="px-4 py-2.5 text-sm font-medium text-zinc-400">Total</td>
              <td className="px-4 py-2.5 text-right text-sm font-bold text-white">{fmt(total)}</td>
              <td />
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
