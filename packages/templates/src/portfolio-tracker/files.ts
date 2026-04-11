import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, TrendingUp, TrendingDown, PieChart, X } from "lucide-react";

let nextId = 20;

const SAMPLE = [
  { id: 1, symbol: "AAPL", name: "Apple Inc.", shares: 25, avgCost: 165, currentPrice: 189 },
  { id: 2, symbol: "GOOGL", name: "Alphabet Inc.", shares: 10, avgCost: 138, currentPrice: 155 },
  { id: 3, symbol: "TSLA", name: "Tesla Inc.", shares: 15, avgCost: 220, currentPrice: 175 },
  { id: 4, symbol: "MSFT", name: "Microsoft Corp.", shares: 20, avgCost: 310, currentPrice: 415 },
  { id: 5, symbol: "AMZN", name: "Amazon.com", shares: 12, avgCost: 145, currentPrice: 182 },
  { id: 6, symbol: "NVDA", name: "NVIDIA Corp.", shares: 8, avgCost: 450, currentPrice: 880 },
];

export function App() {
  const [holdings, setHoldings] = useState(SAMPLE);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ symbol: "", name: "", shares: "", avgCost: "", currentPrice: "" });

  const addHolding = useCallback(() => {
    const shares = parseFloat(form.shares), avg = parseFloat(form.avgCost), price = parseFloat(form.currentPrice);
    if (!form.symbol.trim() || !shares || !avg || !price) return;
    setHoldings((prev) => [...prev, { id: nextId++, symbol: form.symbol.trim().toUpperCase(), name: form.name.trim(), shares, avgCost: avg, currentPrice: price }]);
    setForm({ symbol: "", name: "", shares: "", avgCost: "", currentPrice: "" }); setAdding(false);
  }, [form]);

  const removeHolding = useCallback((id) => { setHoldings((prev) => prev.filter((h) => h.id !== id)); }, []);

  const stats = useMemo(() => {
    let totalCost = 0, totalValue = 0;
    for (const h of holdings) { totalCost += h.shares * h.avgCost; totalValue += h.shares * h.currentPrice; }
    const totalGain = totalValue - totalCost;
    const totalPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    return { totalCost, totalValue, totalGain, totalPct };
  }, [holdings]);

  const fmt = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><PieChart size={20} /> Portfolio</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <span className="text-xs text-zinc-500">Portfolio Value</span>
              <p className="text-2xl font-bold text-white mt-1">{fmt(stats.totalValue)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Total Gain/Loss</span>
              <p className={"text-2xl font-bold mt-1 " + (stats.totalGain >= 0 ? "text-green-400" : "text-red-400")}>{fmt(stats.totalGain)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Return</span>
              <p className={"text-2xl font-bold mt-1 " + (stats.totalPct >= 0 ? "text-green-400" : "text-red-400")}>{pct(stats.totalPct)}</p>
            </div>
          </div>
          {holdings.length > 0 && (
            <div className="flex h-3 rounded-full overflow-hidden mt-4 gap-0.5">
              {holdings.map((h) => {
                const value = h.shares * h.currentPrice;
                const w = stats.totalValue > 0 ? (value / stats.totalValue) * 100 : 0;
                const gain = h.currentPrice > h.avgCost;
                return <div key={h.id} className={"rounded-full " + (gain ? "bg-green-500" : "bg-red-500")} style={{ width: w + "%" }} title={h.symbol + ": " + fmt(value)} />;
              })}
            </div>
          )}
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Add Holding</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-2">
              <input placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="w-24 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none uppercase" />
              <input placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <div className="flex gap-2 mb-3">
              <input type="number" placeholder="Shares" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" placeholder="Avg cost" value={form.avgCost} onChange={(e) => setForm({ ...form, avgCost: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" placeholder="Current" value={form.currentPrice} onChange={(e) => setForm({ ...form, currentPrice: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <button onClick={addHolding} className="w-full rounded-xl bg-emerald-600 py-2.5 text-white text-sm font-medium">Add Holding</button>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900 border border-white/5 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-white/5">
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500">Symbol</th>
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500">Shares</th>
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 text-right">Price</th>
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 text-right">Value</th>
              <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 text-right">Gain/Loss</th>
              <th className="w-8" />
            </tr></thead>
            <tbody>
              {holdings.map((h) => {
                const value = h.shares * h.currentPrice;
                const cost = h.shares * h.avgCost;
                const gain = value - cost;
                const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                const up = gain >= 0;
                return (
                  <tr key={h.id} className="border-b border-white/5 last:border-0 group hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{h.symbol}</span>
                      {h.name && <span className="block text-[10px] text-zinc-500">{h.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{h.shares}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{fmt(h.currentPrice)}</td>
                    <td className="px-4 py-3 text-right text-white font-medium">{fmt(value)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={"flex items-center justify-end gap-0.5 " + (up ? "text-green-400" : "text-red-400")}>
                        {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {fmt(gain)} ({pct(gainPct)})
                      </span>
                    </td>
                    <td className="px-2"><button onClick={() => removeHolding(h.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
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
