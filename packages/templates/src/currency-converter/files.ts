import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo, useCallback } = React;
import { ArrowDownUp, DollarSign } from "lucide-react";

const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", rate: 1 },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", rate: 0.92 },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧", rate: 0.79 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵", rate: 154.5 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺", rate: 1.53 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦", rate: 1.36 },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr", flag: "🇨🇭", rate: 0.88 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳", rate: 7.24 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳", rate: 83.4 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", flag: "🇦🇪", rate: 3.67 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷", rate: 4.97 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", flag: "🇰🇷", rate: 1330 },
];

let histId = 0;

export function App() {
  const [fromCode, setFromCode] = useState("USD");
  const [toCode, setToCode] = useState("EUR");
  const [amount, setAmount] = useState("1000");
  const [history, setHistory] = useState([]);

  const fromCur = CURRENCIES.find((c) => c.code === fromCode);
  const toCur = CURRENCIES.find((c) => c.code === toCode);

  const converted = useMemo(() => {
    const num = parseFloat(amount);
    if (isNaN(num) || !fromCur || !toCur) return null;
    return (num / fromCur.rate) * toCur.rate;
  }, [amount, fromCur, toCur]);

  const exchangeRate = useMemo(() => {
    if (!fromCur || !toCur) return null;
    return toCur.rate / fromCur.rate;
  }, [fromCur, toCur]);

  const swap = useCallback(() => {
    setFromCode(toCode);
    setToCode(fromCode);
    if (converted !== null) setAmount(converted.toFixed(2));
  }, [fromCode, toCode, converted]);

  const save = useCallback(() => {
    if (converted === null) return;
    setHistory((prev) => [{
      id: histId++,
      from: fromCode,
      to: toCode,
      amount: parseFloat(amount),
      result: converted,
      time: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 10));
  }, [fromCode, toCode, amount, converted]);

  const fmt = (n, code) => {
    const cur = CURRENCIES.find((c) => c.code === code);
    return (cur?.symbol || "") + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><DollarSign size={20} /> Currency Converter</h1>

          <div className="rounded-2xl bg-zinc-800/60 p-4 mb-3">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">From</label>
            <div className="flex gap-2 items-center">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-zinc-600" placeholder="0" />
              <select value={fromCode} onChange={(e) => setFromCode(e.target.value)} className="rounded-lg bg-zinc-700 px-2 py-1.5 text-sm text-white outline-none">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-center my-1">
            <button onClick={swap} className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
              <ArrowDownUp size={16} />
            </button>
          </div>

          <div className="rounded-2xl bg-zinc-800/60 p-4 mb-4">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">To</label>
            <div className="flex gap-2 items-center">
              <span className="flex-1 text-2xl font-bold text-emerald-400">{converted !== null ? fmt(converted, toCode) : "—"}</span>
              <select value={toCode} onChange={(e) => setToCode(e.target.value)} className="rounded-lg bg-zinc-700 px-2 py-1.5 text-sm text-white outline-none">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
            </div>
          </div>

          {exchangeRate !== null && (
            <p className="text-center text-xs text-zinc-500 mb-4">
              1 {fromCode} = {exchangeRate.toFixed(4)} {toCode}
            </p>
          )}

          <button onClick={save} disabled={converted === null} className="w-full rounded-xl bg-emerald-600 py-2.5 text-white text-sm font-medium hover:bg-emerald-500 transition-colors disabled:opacity-40 mb-4">
            Save to History
          </button>

          {history.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-zinc-800/40 text-sm">
                  <span className="text-zinc-400">{fmt(h.amount, h.from)}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-emerald-400">{fmt(h.result, h.to)}</span>
                  <span className="text-[10px] text-zinc-700">{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
