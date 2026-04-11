import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Target, Wallet, X } from "lucide-react";

let nextId = 20;

const SAMPLE = [
  { id: 1, name: "Emergency Fund", target: 10000, saved: 6500, emoji: "🛡️", contributions: [{ id: 2, amount: 500, date: "Apr 1" }, { id: 3, amount: 300, date: "Mar 15" }] },
  { id: 2, name: "Vacation", target: 3000, saved: 1200, emoji: "✈️", contributions: [{ id: 4, amount: 400, date: "Apr 5" }] },
  { id: 3, name: "New Laptop", target: 2000, saved: 800, emoji: "💻", contributions: [{ id: 5, amount: 200, date: "Apr 2" }] },
];

export function App() {
  const [goals, setGoals] = useState(SAMPLE);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", emoji: "🎯" });
  const [addAmount, setAddAmount] = useState("");

  const totalSaved = useMemo(() => goals.reduce((s, g) => s + g.saved, 0), [goals]);
  const totalTarget = useMemo(() => goals.reduce((s, g) => s + g.target, 0), [goals]);

  const addGoal = useCallback(() => {
    const t = parseFloat(form.target);
    if (!form.name.trim() || !t) return;
    setGoals((prev) => [...prev, { id: nextId++, name: form.name.trim(), target: t, saved: 0, emoji: form.emoji || "🎯", contributions: [] }]);
    setForm({ name: "", target: "", emoji: "🎯" }); setAdding(false);
  }, [form]);

  const deleteGoal = useCallback((id) => { setGoals((prev) => prev.filter((g) => g.id !== id)); if (selected === id) setSelected(null); }, [selected]);

  const contribute = useCallback((goalId) => {
    const amt = parseFloat(addAmount);
    if (!amt) return;
    setGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, saved: Math.min(g.target, g.saved + amt), contributions: [{ id: nextId++, amount: amt, date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) }, ...g.contributions] } : g));
    setAddAmount("");
  }, [addAmount]);

  const fmt = (n) => "$" + n.toLocaleString();
  const detail = goals.find((g) => g.id === selected);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Target size={20} /> Savings Goals</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors">
            <Plus size={14} /> New Goal
          </button>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Total Progress</span>
            <span className="text-sm font-bold text-green-400">{fmt(totalSaved)} / {fmt(totalTarget)}</span>
          </div>
          <div className="w-full h-2.5 bg-zinc-800 rounded-full">
            <div className="h-2.5 bg-green-500 rounded-full transition-all" style={{ width: (totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0) + "%" }} />
          </div>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-white">New Goal</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-2">
              <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className="w-10 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-center outline-none" maxLength={2} />
              <input placeholder="Goal name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" placeholder="Target $" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="w-24 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <button onClick={addGoal} className="w-full rounded-xl bg-green-600 py-2 text-white text-sm font-medium">Create Goal</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{detail.emoji}</span>
                <div>
                  <h2 className="text-sm font-semibold text-white">{detail.name}</h2>
                  <p className="text-xs text-zinc-500">{fmt(detail.saved)} of {fmt(detail.target)}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="w-full h-3 bg-zinc-800 rounded-full mb-4">
              <div className={"h-3 rounded-full transition-all " + (detail.saved >= detail.target ? "bg-green-500" : "bg-green-600")} style={{ width: Math.min(100, (detail.saved / detail.target) * 100) + "%" }} />
            </div>
            <div className="flex gap-2 mb-4">
              <input type="number" placeholder="Amount" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <button onClick={() => contribute(detail.id)} className="rounded-xl bg-green-600 px-4 py-2.5 text-white text-sm font-medium"><Plus size={15} /></button>
            </div>
            {detail.contributions.length > 0 && (
              <div>
                <h3 className="text-xs text-zinc-500 mb-2">Contributions</h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {detail.contributions.map((c) => (
                    <div key={c.id} className="flex justify-between text-sm px-2 py-1">
                      <span className="text-zinc-500">{c.date}</span>
                      <span className="text-green-400">+{fmt(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => deleteGoal(detail.id)} className="mt-3 text-xs text-red-400 hover:text-red-300">Delete goal</button>
          </div>
        ) : (
          <div className="space-y-2">
            {goals.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No goals yet</p>}
            {goals.map((g) => {
              const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0;
              return (
                <button key={g.id} onClick={() => { setSelected(g.id); setAdding(false); }} className="w-full text-left rounded-2xl bg-zinc-900 border border-white/5 p-4 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{g.emoji}</span>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-white">{g.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full">
                          <div className={"h-1.5 rounded-full " + (pct >= 100 ? "bg-green-500" : "bg-green-600")} style={{ width: Math.min(100, pct) + "%" }} />
                        </div>
                        <span className="text-xs text-zinc-500">{pct}%</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-green-400">{fmt(g.saved)}</span>
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
