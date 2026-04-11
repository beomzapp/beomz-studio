import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, TrendingDown, X, DollarSign, Target } from "lucide-react";

let nextId = 10;

const SAMPLE = [
  { id: 1, name: "Credit Card A", balance: 4200, rate: 22.9, minPayment: 120 },
  { id: 2, name: "Student Loan", balance: 18000, rate: 5.5, minPayment: 250 },
  { id: 3, name: "Car Loan", balance: 8500, rate: 6.9, minPayment: 320 },
  { id: 4, name: "Credit Card B", balance: 1800, rate: 19.9, minPayment: 55 },
];

export function App() {
  const [debts, setDebts] = useState(SAMPLE);
  const [strategy, setStrategy] = useState("avalanche");
  const [extraPayment, setExtraPayment] = useState("200");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", balance: "", rate: "", minPayment: "" });

  const addDebt = useCallback(() => {
    const b = parseFloat(form.balance), r = parseFloat(form.rate), m = parseFloat(form.minPayment);
    if (!form.name.trim() || !b || !r) return;
    setDebts((prev) => [...prev, { id: nextId++, name: form.name.trim(), balance: b, rate: r, minPayment: m || 25 }]);
    setForm({ name: "", balance: "", rate: "", minPayment: "" });
    setAdding(false);
  }, [form]);

  const removeDebt = useCallback((id) => { setDebts((prev) => prev.filter((d) => d.id !== id)); }, []);

  const totalBalance = useMemo(() => debts.reduce((s, d) => s + d.balance, 0), [debts]);
  const totalMinPayment = useMemo(() => debts.reduce((s, d) => s + d.minPayment, 0), [debts]);
  const extra = parseFloat(extraPayment) || 0;

  const sorted = useMemo(() => {
    const copy = [...debts];
    if (strategy === "avalanche") copy.sort((a, b) => b.rate - a.rate);
    else copy.sort((a, b) => a.balance - b.balance);
    return copy;
  }, [debts, strategy]);

  const payoffMonths = useMemo(() => {
    if (debts.length === 0) return 0;
    const balances = {};
    for (const d of debts) balances[d.id] = d.balance;
    let months = 0;
    const order = sorted.map((d) => d.id);
    while (Object.values(balances).some((b) => b > 0) && months < 600) {
      months++;
      let extraLeft = extra;
      for (const d of debts) {
        if (balances[d.id] <= 0) continue;
        const interest = balances[d.id] * (d.rate / 100 / 12);
        balances[d.id] += interest - d.minPayment;
        if (balances[d.id] < 0) { extraLeft += Math.abs(balances[d.id]); balances[d.id] = 0; }
      }
      for (const id of order) {
        if (balances[id] > 0 && extraLeft > 0) {
          const apply = Math.min(extraLeft, balances[id]);
          balances[id] -= apply;
          extraLeft -= apply;
        }
      }
    }
    return months;
  }, [debts, sorted, extra]);

  const fmt = (n) => "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><TrendingDown size={20} /> Debt Payoff</h1>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-red-400">{fmt(totalBalance)}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Total Debt</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{fmt(totalMinPayment + extra)}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Monthly</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-emerald-400">{payoffMonths < 600 ? payoffMonths + "mo" : "600+"}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Debt Free</p>
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-400">Strategy</span>
            <div className="flex gap-1">
              {["avalanche", "snowball"].map((s) => (
                <button key={s} onClick={() => setStrategy(s)} className={"rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all " + (strategy === s ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-500")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-600">{strategy === "avalanche" ? "Pay highest interest rate first (saves the most money)" : "Pay smallest balance first (fastest wins for motivation)"}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-zinc-500">Extra monthly:</span>
            <span className="text-xs text-zinc-500">$</span>
            <input type="number" value={extraPayment} onChange={(e) => setExtraPayment(e.target.value)} className="w-20 rounded-lg bg-zinc-800 border border-white/5 px-2 py-1.5 text-sm text-white outline-none text-center" />
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-zinc-400">Debts ({debts.length})</span>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"><Plus size={13} /> Add</button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white">New Debt</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <div className="flex gap-2 mb-2">
              <input type="number" placeholder="Balance" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" placeholder="APR %" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className="w-24 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" placeholder="Min $" value={form.minPayment} onChange={(e) => setForm({ ...form, minPayment: e.target.value })} className="w-20 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <button onClick={addDebt} className="w-full rounded-xl bg-emerald-600 py-2 text-white text-sm font-medium">Add Debt</button>
          </div>
        )}

        <div className="space-y-2">
          {sorted.map((d, i) => {
            const pctOfTotal = totalBalance > 0 ? (d.balance / totalBalance) * 100 : 0;
            return (
              <div key={d.id} className={"group rounded-xl bg-zinc-900 border px-4 py-3 " + (i === 0 ? "border-emerald-500/30" : "border-white/5")}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {i === 0 && <Target size={12} className="text-emerald-400" />}
                    <span className="text-sm font-medium text-white">{d.name}</span>
                  </div>
                  <button onClick={() => removeDebt(d.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                  <span>{d.rate}% APR</span>
                  <span>Min: {fmt(d.minPayment)}/mo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full">
                    <div className="h-2 bg-red-500 rounded-full" style={{ width: pctOfTotal + "%" }} />
                  </div>
                  <span className="text-sm font-medium text-red-400">{fmt(d.balance)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
