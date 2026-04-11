import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet } from "lucide-react";

let nextId = 1;
const CATEGORIES = ["Food", "Transport", "Housing", "Entertainment", "Health", "Shopping", "Other"];

export function App() {
  const [entries, setEntries] = useState([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [type, setType] = useState("expense");

  const addEntry = useCallback(() => {
    const val = parseFloat(amount);
    if (!val || !description.trim()) return;
    setEntries((prev) => [
      { id: nextId++, amount: val, description: description.trim(), category, type, date: new Date().toLocaleDateString() },
      ...prev,
    ]);
    setAmount("");
    setDescription("");
  }, [amount, description, category, type]);

  const deleteEntry = useCallback((id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const stats = useMemo(() => {
    const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const expenses = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
    return { income, expenses, balance: income - expenses };
  }, [entries]);

  const fmt = (n) => "$" + Math.abs(n).toFixed(2);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5">Budget Planner</h1>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-green-400" />
              <span className="text-xs text-zinc-500">Income</span>
            </div>
            <span className="text-lg font-semibold text-green-400">{fmt(stats.income)}</span>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={14} className="text-red-400" />
              <span className="text-xs text-zinc-500">Expenses</span>
            </div>
            <span className="text-lg font-semibold text-red-400">{fmt(stats.expenses)}</span>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={14} className="text-white" />
              <span className="text-xs text-zinc-500">Balance</span>
            </div>
            <span className={"text-lg font-semibold " + (stats.balance >= 0 ? "text-green-400" : "text-red-400")}>
              {stats.balance < 0 ? "-" : ""}{fmt(stats.balance)}
            </span>
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
          <div className="flex gap-2 mb-3">
            {["expense", "income"].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={"rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all " +
                  (type === t ? (t === "income" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "bg-zinc-800 text-zinc-500")}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            <input
              type="number"
              inputMode="decimal"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none"
            />
            <input
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm outline-none"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={addEntry}
              className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-green-500 transition-colors"
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="text-center text-sm text-zinc-600 py-8">No entries yet — add one above</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              <div className={"h-2 w-2 rounded-full flex-shrink-0 " + (entry.type === "income" ? "bg-green-400" : "bg-red-400")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white truncate">{entry.description}</span>
                  <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">{entry.category}</span>
                </div>
                <span className="text-xs text-zinc-600">{entry.date}</span>
              </div>
              <span className={"text-sm font-medium " + (entry.type === "income" ? "text-green-400" : "text-red-400")}>
                {entry.type === "income" ? "+" : "-"}{fmt(entry.amount)}
              </span>
              <button onClick={() => deleteEntry(entry.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                <Trash2 size={14} />
              </button>
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
