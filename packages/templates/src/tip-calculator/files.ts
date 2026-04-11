import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;

export function App() {
  const [bill, setBill] = useState("");
  const [tipPercent, setTipPercent] = useState(18);
  const [people, setPeople] = useState(1);

  const tipPresets = [10, 15, 18, 20, 25];

  const { tipAmount, totalAmount, perPerson } = useMemo(() => {
    const b = parseFloat(bill) || 0;
    const tip = b * (tipPercent / 100);
    const total = b + tip;
    const pp = people > 0 ? total / people : total;
    return { tipAmount: tip, totalAmount: total, perPerson: pp };
  }, [bill, tipPercent, people]);

  const fmt = (n) => "$" + n.toFixed(2);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl bg-zinc-900 p-6 shadow-2xl border border-white/5">
          <h1 className="text-xl font-semibold text-white mb-6">Tip Calculator</h1>

          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Bill Amount</label>
          <div className="relative mb-5">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
            <input
              type="number"
              inputMode="decimal"
              value={bill}
              onChange={(e) => setBill(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl bg-zinc-800 border border-white/5 py-3 pl-8 pr-4 text-white text-lg placeholder-zinc-600 outline-none focus:border-green-500/40"
            />
          </div>

          <label className="block text-xs font-medium text-zinc-400 mb-2">Tip — {tipPercent}%</label>
          <div className="flex gap-2 mb-3">
            {tipPresets.map((p) => (
              <button
                key={p}
                onClick={() => setTipPercent(p)}
                className={"flex-1 rounded-lg py-2 text-sm font-medium transition-all " +
                  (tipPercent === p
                    ? "bg-green-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}
              >
                {p}%
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={50}
            value={tipPercent}
            onChange={(e) => setTipPercent(Number(e.target.value))}
            className="w-full mb-5 accent-green-500"
          />

          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Split Between</label>
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setPeople((p) => Math.max(1, p - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-white text-lg font-medium hover:bg-zinc-700 transition-colors"
            >
              -
            </button>
            <span className="text-xl font-semibold text-white w-8 text-center">{people}</span>
            <button
              onClick={() => setPeople((p) => p + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-white text-lg font-medium hover:bg-zinc-700 transition-colors"
            >
              +
            </button>
            <span className="text-sm text-zinc-500">{people === 1 ? "person" : "people"}</span>
          </div>

          <div className="rounded-2xl bg-zinc-800/60 p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">Tip</span>
              <span className="text-sm text-white">{fmt(tipAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-sm text-white">{fmt(totalAmount)}</span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex justify-between items-end">
              <span className="text-sm text-zinc-400">Per person</span>
              <span className="text-2xl font-bold text-green-400">{fmt(perPerson)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
