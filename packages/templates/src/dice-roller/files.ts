import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Dice1, Plus, Minus, RotateCcw, History } from "lucide-react";

const DICE_TYPES = [
  { sides: 4, label: "D4", color: "bg-green-600" },
  { sides: 6, label: "D6", color: "bg-blue-600" },
  { sides: 8, label: "D8", color: "bg-purple-600" },
  { sides: 10, label: "D10", color: "bg-pink-600" },
  { sides: 12, label: "D12", color: "bg-orange-600" },
  { sides: 20, label: "D20", color: "bg-red-600" },
];

let rollId = 0;

export function App() {
  const [selectedDice, setSelectedDice] = useState(6);
  const [count, setCount] = useState(1);
  const [results, setResults] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const roll = useCallback(() => {
    setRolling(true);
    const dice = DICE_TYPES.find((d) => d.sides === selectedDice);
    setTimeout(() => {
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * selectedDice) + 1);
      const total = rolls.reduce((s, v) => s + v, 0);
      setResults({ rolls, total, label: dice.label, count });
      setHistory((prev) => [{ id: rollId++, label: count + dice.label, rolls, total, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
      setRolling(false);
    }, 300);
  }, [selectedDice, count]);

  const dice = DICE_TYPES.find((d) => d.sides === selectedDice);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Dice1 size={20} /> Dice Roller</h1>
            <button onClick={() => setShowHistory((h) => !h)} className={"text-zinc-500 hover:text-white transition-colors " + (showHistory ? "text-amber-400" : "")}>
              <History size={18} />
            </button>
          </div>

          <div className="grid grid-cols-6 gap-2 mb-5">
            {DICE_TYPES.map((d) => (
              <button
                key={d.sides}
                onClick={() => setSelectedDice(d.sides)}
                className={"flex flex-col items-center justify-center rounded-xl py-2.5 text-xs font-bold transition-all " +
                  (selectedDice === d.sides ? d.color + " text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300")}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 mb-5">
            <button onClick={() => setCount((c) => Math.max(1, c - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
              <Minus size={16} />
            </button>
            <span className="text-2xl font-bold text-white w-20 text-center">{count}{dice.label}</span>
            <button onClick={() => setCount((c) => Math.min(10, c + 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
              <Plus size={16} />
            </button>
          </div>

          <button
            onClick={roll}
            disabled={rolling}
            className={"w-full rounded-xl py-4 text-white text-lg font-bold transition-all " + dice.color + " hover:opacity-90 disabled:opacity-60"}
          >
            {rolling ? "Rolling..." : "Roll!"}
          </button>

          {results && !rolling && (
            <div className="mt-5 rounded-2xl bg-zinc-800/60 p-5 text-center">
              <div className="flex flex-wrap justify-center gap-2 mb-3">
                {results.rolls.map((r, i) => (
                  <div key={i} className={"flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white " + dice.color}>
                    {r}
                  </div>
                ))}
              </div>
              {results.rolls.length > 1 && (
                <p className="text-2xl font-bold text-white">Total: {results.total}</p>
              )}
            </div>
          )}

          {showHistory && history.length > 0 && (
            <div className="mt-4 rounded-2xl bg-zinc-800/40 p-4 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">History</span>
                <button onClick={() => setHistory([])} className="text-[10px] text-zinc-600 hover:text-zinc-400"><RotateCcw size={10} className="inline mr-1" />Clear</button>
              </div>
              <div className="space-y-1.5">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">{h.label}</span>
                    <span className="text-zinc-500 text-xs">[{h.rolls.join(", ")}]</span>
                    <span className="font-medium text-white">{h.total}</span>
                    <span className="text-[10px] text-zinc-600">{h.time}</span>
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
