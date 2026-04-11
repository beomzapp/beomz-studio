import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, X } from "lucide-react";

let nextId = 20;

const SAMPLE_ASSETS = [
  { id: 1, name: "Checking Account", value: 12500, category: "Cash" },
  { id: 2, name: "Savings Account", value: 35000, category: "Cash" },
  { id: 3, name: "401(k)", value: 87000, category: "Investments" },
  { id: 4, name: "Brokerage", value: 24000, category: "Investments" },
  { id: 5, name: "Home Equity", value: 180000, category: "Property" },
];

const SAMPLE_LIABILITIES = [
  { id: 6, name: "Mortgage", value: 210000, category: "Loans" },
  { id: 7, name: "Student Loan", value: 18000, category: "Loans" },
  { id: 8, name: "Credit Card", value: 2400, category: "Debt" },
];

const CATEGORIES = { assets: ["Cash", "Investments", "Property", "Other"], liabilities: ["Loans", "Debt", "Other"] };

export function App() {
  const [assets, setAssets] = useState(SAMPLE_ASSETS);
  const [liabilities, setLiabilities] = useState(SAMPLE_LIABILITIES);
  const [tab, setTab] = useState("overview");
  const [addingTo, setAddingTo] = useState(null);
  const [form, setForm] = useState({ name: "", value: "", category: "Cash" });

  const totalAssets = useMemo(() => assets.reduce((s, a) => s + a.value, 0), [assets]);
  const totalLiabilities = useMemo(() => liabilities.reduce((s, l) => s + l.value, 0), [liabilities]);
  const netWorth = totalAssets - totalLiabilities;

  const addItem = useCallback((type) => {
    const val = parseFloat(form.value);
    if (!form.name.trim() || !val) return;
    const item = { id: nextId++, name: form.name.trim(), value: val, category: form.category };
    if (type === "asset") setAssets((prev) => [...prev, item]);
    else setLiabilities((prev) => [...prev, item]);
    setForm({ name: "", value: "", category: type === "asset" ? "Cash" : "Loans" });
    setAddingTo(null);
  }, [form]);

  const removeAsset = useCallback((id) => { setAssets((prev) => prev.filter((a) => a.id !== id)); }, []);
  const removeLiability = useCallback((id) => { setLiabilities((prev) => prev.filter((l) => l.id !== id)); }, []);

  const fmt = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString();

  const assetsByCategory = useMemo(() => {
    const map = {};
    for (const a of assets) map[a.category] = (map[a.category] || 0) + a.value;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Wallet size={20} /> Net Worth</h1>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5 text-center">
          <span className="text-xs text-zinc-500">Net Worth</span>
          <p className={"text-4xl font-bold mt-1 " + (netWorth >= 0 ? "text-emerald-400" : "text-red-400")}>{fmt(netWorth)}</p>
          <div className="flex justify-center gap-6 mt-3">
            <div><span className="text-xs text-zinc-500">Assets</span><p className="text-sm font-medium text-green-400">{fmt(totalAssets)}</p></div>
            <div><span className="text-xs text-zinc-500">Liabilities</span><p className="text-sm font-medium text-red-400">{fmt(totalLiabilities)}</p></div>
          </div>
          {totalAssets > 0 && (
            <div className="flex h-2 rounded-full overflow-hidden mt-4 bg-red-500/30">
              <div className="bg-emerald-500 transition-all" style={{ width: (totalAssets / (totalAssets + totalLiabilities)) * 100 + "%" }} />
            </div>
          )}
        </div>

        {assetsByCategory.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
            <span className="text-xs text-zinc-500 mb-3 block">Asset Allocation</span>
            <div className="space-y-2">
              {assetsByCategory.map(([cat, val]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="text-sm text-zinc-300 flex-1">{cat}</span>
                  <span className="text-sm text-zinc-400">{fmt(val)}</span>
                  <div className="w-16 h-1.5 bg-zinc-800 rounded-full">
                    <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: (totalAssets > 0 ? (val / totalAssets) * 100 : 0) + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-4">
          {["assets", "liabilities"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={"flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-all " + (tab === t ? "bg-zinc-800 text-white" : "text-zinc-500")}>
              {t} ({t === "assets" ? assets.length : liabilities.length})
            </button>
          ))}
        </div>

        {addingTo && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white capitalize">Add {addingTo}</span>
              <button onClick={() => setAddingTo(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-2">
              <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-28 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <div className="flex gap-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none">
                {CATEGORIES[addingTo === "asset" ? "assets" : "liabilities"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <button onClick={() => addItem(addingTo)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white font-medium">Add</button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {(tab === "assets" ? assets : liabilities).map((item) => (
            <div key={item.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              {tab === "assets" ? <TrendingUp size={14} className="text-green-400 flex-shrink-0" /> : <TrendingDown size={14} className="text-red-400 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{item.name}</span>
                <span className="block text-xs text-zinc-600">{item.category}</span>
              </div>
              <span className={"text-sm font-medium " + (tab === "assets" ? "text-green-400" : "text-red-400")}>{fmt(item.value)}</span>
              <button onClick={() => tab === "assets" ? removeAsset(item.id) : removeLiability(item.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={() => { setAddingTo(tab === "assets" ? "asset" : "liability"); setForm({ ...form, category: tab === "assets" ? "Cash" : "Loans" }); }} className="w-full rounded-xl border border-dashed border-zinc-800 py-3 text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors flex items-center justify-center gap-1">
            <Plus size={14} /> Add {tab === "assets" ? "Asset" : "Liability"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
