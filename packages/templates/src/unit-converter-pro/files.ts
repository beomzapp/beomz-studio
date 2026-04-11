import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo, useCallback } = React;
import { ArrowDownUp, Star, Clock } from "lucide-react";

const CATEGORIES = {
  Length: { units: [{ id: "m", n: "Meters", f: 1 }, { id: "km", n: "Kilometers", f: 1000 }, { id: "cm", n: "Centimeters", f: 0.01 }, { id: "mm", n: "Millimeters", f: 0.001 }, { id: "mi", n: "Miles", f: 1609.344 }, { id: "ft", n: "Feet", f: 0.3048 }, { id: "in", n: "Inches", f: 0.0254 }, { id: "yd", n: "Yards", f: 0.9144 }] },
  Weight: { units: [{ id: "kg", n: "Kilograms", f: 1 }, { id: "g", n: "Grams", f: 0.001 }, { id: "lb", n: "Pounds", f: 0.453592 }, { id: "oz", n: "Ounces", f: 0.0283495 }, { id: "st", n: "Stones", f: 6.35029 }, { id: "mg", n: "Milligrams", f: 0.000001 }] },
  Temperature: { units: [{ id: "c", n: "Celsius", f: null }, { id: "f", n: "Fahrenheit", f: null }, { id: "k", n: "Kelvin", f: null }] },
  Speed: { units: [{ id: "ms", n: "m/s", f: 1 }, { id: "kmh", n: "km/h", f: 0.277778 }, { id: "mph", n: "mph", f: 0.44704 }, { id: "kn", n: "Knots", f: 0.514444 }] },
  Area: { units: [{ id: "m2", n: "sq meters", f: 1 }, { id: "km2", n: "sq km", f: 1000000 }, { id: "ft2", n: "sq feet", f: 0.092903 }, { id: "ac", n: "Acres", f: 4046.86 }, { id: "ha", n: "Hectares", f: 10000 }] },
  Volume: { units: [{ id: "l", n: "Liters", f: 1 }, { id: "ml", n: "Milliliters", f: 0.001 }, { id: "gal", n: "Gallons", f: 3.78541 }, { id: "cup", n: "Cups", f: 0.236588 }, { id: "floz", n: "Fl Oz", f: 0.0295735 }] },
  Data: { units: [{ id: "b", n: "Bytes", f: 1 }, { id: "kb", n: "KB", f: 1024 }, { id: "mb", n: "MB", f: 1048576 }, { id: "gb", n: "GB", f: 1073741824 }, { id: "tb", n: "TB", f: 1099511627776 }] },
  Time: { units: [{ id: "sec", n: "Seconds", f: 1 }, { id: "min", n: "Minutes", f: 60 }, { id: "hr", n: "Hours", f: 3600 }, { id: "day", n: "Days", f: 86400 }, { id: "wk", n: "Weeks", f: 604800 }] },
};

function convertTemp(val, from, to) {
  let c;
  if (from === "c") c = val;
  else if (from === "f") c = (val - 32) * 5 / 9;
  else c = val - 273.15;
  if (to === "c") return c;
  if (to === "f") return c * 9 / 5 + 32;
  return c + 273.15;
}

let histId = 0;

export function App() {
  const [cat, setCat] = useState("Length");
  const [from, setFrom] = useState("m");
  const [to, setTo] = useState("km");
  const [value, setValue] = useState("1");
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);

  const units = CATEGORIES[cat].units;

  const result = useMemo(() => {
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    if (cat === "Temperature") return convertTemp(num, from, to).toFixed(4);
    const ff = units.find((u) => u.id === from)?.f || 1;
    const tf = units.find((u) => u.id === to)?.f || 1;
    return ((num * ff) / tf).toFixed(8).replace(/\\.?0+$/, "");
  }, [value, from, to, cat, units]);

  const swap = useCallback(() => { setFrom(to); setTo(from); setValue(result || value); }, [from, to, result, value]);

  const changeCat = useCallback((c) => {
    setCat(c);
    const u = CATEGORIES[c].units;
    setFrom(u[0].id);
    setTo(u[1]?.id || u[0].id);
    setValue("1");
  }, []);

  const saveToHistory = useCallback(() => {
    if (!result) return;
    const fromName = units.find((u) => u.id === from)?.n || from;
    const toName = units.find((u) => u.id === to)?.n || to;
    setHistory((prev) => [{ id: histId++, cat, from: fromName, to: toName, value, result }, ...prev].slice(0, 10));
  }, [cat, from, to, value, result, units]);

  const favKey = cat + ":" + from + ":" + to;
  const isFav = favorites.includes(favKey);
  const toggleFav = useCallback(() => {
    setFavorites((prev) => isFav ? prev.filter((f) => f !== favKey) : [...prev, favKey]);
  }, [isFav, favKey]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-4">Unit Converter Pro</h1>

          <div className="grid grid-cols-4 gap-1 mb-5">
            {Object.keys(CATEGORIES).map((c) => (
              <button key={c} onClick={() => changeCat(c)} className={"rounded-lg py-1.5 text-[10px] font-medium transition-all " + (cat === c ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300")}>
                {c}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-zinc-800/60 p-4 mb-2">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">From</label>
            <div className="flex gap-2">
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 bg-transparent text-2xl font-bold text-white outline-none" placeholder="0" />
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg bg-zinc-700 px-2 py-1 text-sm text-white outline-none">
                {units.map((u) => <option key={u.id} value={u.id}>{u.n}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-center gap-2 my-1">
            <button onClick={swap} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
              <ArrowDownUp size={15} />
            </button>
            <button onClick={toggleFav} className={isFav ? "text-amber-400" : "text-zinc-600 hover:text-amber-400"}>
              <Star size={16} fill={isFav ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="rounded-2xl bg-zinc-800/60 p-4 mb-4">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">To</label>
            <div className="flex gap-2">
              <span className="flex-1 text-2xl font-bold text-cyan-400">{result || "—"}</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg bg-zinc-700 px-2 py-1 text-sm text-white outline-none">
                {units.map((u) => <option key={u.id} value={u.id}>{u.n}</option>)}
              </select>
            </div>
          </div>

          <button onClick={saveToHistory} disabled={!result} className="w-full rounded-xl bg-cyan-600 py-2 text-white text-sm font-medium hover:bg-cyan-500 transition-colors disabled:opacity-40 mb-4">
            Save to History
          </button>

          {history.length > 0 && (
            <div>
              <span className="text-xs text-zinc-500 flex items-center gap-1 mb-2"><Clock size={10} /> Recent</span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs hover:bg-zinc-800/40">
                    <span className="text-zinc-500">{h.cat}</span>
                    <span className="text-zinc-300">{h.value} {h.from}</span>
                    <span className="text-zinc-600">=</span>
                    <span className="text-cyan-400">{h.result} {h.to}</span>
                  </div>
                ))}
              </div>
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
