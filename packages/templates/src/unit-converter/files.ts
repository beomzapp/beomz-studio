import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo, useCallback } = React;
import { ArrowDownUp, Ruler, Weight, Thermometer, Droplets } from "lucide-react";

const CATEGORIES = {
  length: {
    label: "Length", icon: Ruler,
    units: [
      { id: "m", name: "Meters", factor: 1 },
      { id: "km", name: "Kilometers", factor: 1000 },
      { id: "cm", name: "Centimeters", factor: 0.01 },
      { id: "mm", name: "Millimeters", factor: 0.001 },
      { id: "mi", name: "Miles", factor: 1609.344 },
      { id: "ft", name: "Feet", factor: 0.3048 },
      { id: "in", name: "Inches", factor: 0.0254 },
      { id: "yd", name: "Yards", factor: 0.9144 },
    ],
  },
  weight: {
    label: "Weight", icon: Weight,
    units: [
      { id: "kg", name: "Kilograms", factor: 1 },
      { id: "g", name: "Grams", factor: 0.001 },
      { id: "mg", name: "Milligrams", factor: 0.000001 },
      { id: "lb", name: "Pounds", factor: 0.453592 },
      { id: "oz", name: "Ounces", factor: 0.0283495 },
      { id: "st", name: "Stones", factor: 6.35029 },
    ],
  },
  temperature: {
    label: "Temperature", icon: Thermometer,
    units: [
      { id: "c", name: "Celsius", factor: null },
      { id: "f", name: "Fahrenheit", factor: null },
      { id: "k", name: "Kelvin", factor: null },
    ],
  },
  volume: {
    label: "Volume", icon: Droplets,
    units: [
      { id: "l", name: "Liters", factor: 1 },
      { id: "ml", name: "Milliliters", factor: 0.001 },
      { id: "gal", name: "Gallons (US)", factor: 3.78541 },
      { id: "qt", name: "Quarts", factor: 0.946353 },
      { id: "cup", name: "Cups", factor: 0.236588 },
      { id: "floz", name: "Fl Oz", factor: 0.0295735 },
    ],
  },
};

function convertTemp(value, from, to) {
  let celsius;
  if (from === "c") celsius = value;
  else if (from === "f") celsius = (value - 32) * 5 / 9;
  else celsius = value - 273.15;
  if (to === "c") return celsius;
  if (to === "f") return celsius * 9 / 5 + 32;
  return celsius + 273.15;
}

export function App() {
  const [category, setCategory] = useState("length");
  const [fromUnit, setFromUnit] = useState("m");
  const [toUnit, setToUnit] = useState("km");
  const [value, setValue] = useState("1");

  const cat = CATEGORIES[category];

  const result = useMemo(() => {
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    if (category === "temperature") return convertTemp(num, fromUnit, toUnit).toFixed(4);
    const fromFactor = cat.units.find((u) => u.id === fromUnit)?.factor || 1;
    const toFactor = cat.units.find((u) => u.id === toUnit)?.factor || 1;
    return ((num * fromFactor) / toFactor).toFixed(6).replace(/\\.?0+$/, "");
  }, [value, fromUnit, toUnit, category, cat]);

  const swap = useCallback(() => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
    setValue(result || value);
  }, [fromUnit, toUnit, result, value]);

  const changeCategory = useCallback((key) => {
    setCategory(key);
    const units = CATEGORIES[key].units;
    setFromUnit(units[0].id);
    setToUnit(units[1]?.id || units[0].id);
    setValue("1");
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-5">Unit Converter</h1>

          <div className="grid grid-cols-4 gap-1.5 mb-5">
            {Object.entries(CATEGORIES).map(([key, { label, icon: Icon }]) => (
              <button key={key} onClick={() => changeCategory(key)} className={"flex flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-medium transition-all " + (category === key ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300")}>
                <Icon size={16} />{label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-zinc-800/60 p-4">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">From</label>
              <div className="flex gap-2">
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-zinc-600" placeholder="0" />
                <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className="rounded-lg bg-zinc-700 border-none px-2 py-1 text-sm text-white outline-none">
                  {cat.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex justify-center">
              <button onClick={swap} className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                <ArrowDownUp size={16} />
              </button>
            </div>

            <div className="rounded-2xl bg-zinc-800/60 p-4">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 block">To</label>
              <div className="flex gap-2">
                <span className="flex-1 text-2xl font-bold text-cyan-400">{result || "—"}</span>
                <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} className="rounded-lg bg-zinc-700 border-none px-2 py-1 text-sm text-white outline-none">
                  {cat.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
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
