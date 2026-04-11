import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, DollarSign, Tag } from "lucide-react";

let nextId = 1;
const CATEGORIES = [
  { name: "Food", color: "bg-orange-500" },
  { name: "Transport", color: "bg-blue-500" },
  { name: "Housing", color: "bg-purple-500" },
  { name: "Entertainment", color: "bg-pink-500" },
  { name: "Health", color: "bg-green-500" },
  { name: "Shopping", color: "bg-amber-500" },
  { name: "Other", color: "bg-zinc-500" },
];

export function App() {
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Food");

  const addExpense = useCallback(() => {
    const val = parseFloat(amount);
    if (!val || !description.trim()) return;
    setExpenses((prev) => [
      { id: nextId++, amount: val, description: description.trim(), category, date: new Date().toLocaleDateString() },
      ...prev,
    ]);
    setAmount("");
    setDescription("");
  }, [amount, description, category]);

  const deleteExpense = useCallback((id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  const byCategory = useMemo(() => {
    const map = {};
    for (const e of expenses) {
      map[e.category] = (map[e.category] || 0) + e.amount;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const fmt = (n) => "$" + n.toFixed(2);
  const catColor = (name) => CATEGORIES.find((c) => c.name === name)?.color || "bg-zinc-500";

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5">Expense Tracker</h1>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={16} className="text-rose-400" />
            <span className="text-xs text-zinc-500">Total Spent</span>
          </div>
          <span className="text-3xl font-bold text-white">{fmt(total)}</span>
        </div>

        {byCategory.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <h2 className="text-xs font-medium text-zinc-400 mb-3">By Category</h2>
            <div className="space-y-2">
              {byCategory.map(([cat, amt]) => (
                <div key={cat} className="flex items-center gap-3">
                  <div className={"h-2.5 w-2.5 rounded-full flex-shrink-0 " + catColor(cat)} />
                  <span className="text-sm text-zinc-300 flex-1">{cat}</span>
                  <span className="text-sm text-zinc-400">{fmt(amt)}</span>
                  <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={"h-full rounded-full " + catColor(cat)} style={{ width: (total > 0 ? (amt / total) * 100 : 0) + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
          <h2 className="text-xs font-medium text-zinc-400 mb-3">Add Expense</h2>
          <div className="flex gap-2 mb-3">
            <div className="relative w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 py-2.5 pl-7 pr-3 text-white text-sm placeholder-zinc-600 outline-none" />
            </div>
            <input type="text" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none" />
          </div>
          <div className="flex gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm outline-none">
              {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button onClick={addExpense} className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-rose-500 transition-colors">
              <Plus size={15} /> Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {expenses.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No expenses yet</p>}
          {expenses.map((e) => (
            <div key={e.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              <div className={"h-2 w-2 rounded-full flex-shrink-0 " + catColor(e.category)} />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white truncate block">{e.description}</span>
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <Tag size={10} />{e.category} · {e.date}
                </div>
              </div>
              <span className="text-sm font-medium text-rose-400">{fmt(e.amount)}</span>
              <button onClick={() => deleteExpense(e.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"><Trash2 size={14} /></button>
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
