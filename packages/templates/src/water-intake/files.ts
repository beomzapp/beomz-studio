import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Minus, Droplets, RotateCcw } from "lucide-react";

const GOAL_DEFAULT = 8;

export function App() {
  const [glasses, setGlasses] = useState(0);
  const [goal, setGoal] = useState(GOAL_DEFAULT);
  const [history, setHistory] = useState([]);

  const pct = useMemo(() => Math.min(100, Math.round((glasses / goal) * 100)), [glasses, goal]);
  const remaining = Math.max(0, goal - glasses);

  const addGlass = useCallback(() => {
    setGlasses((g) => g + 1);
  }, []);

  const removeGlass = useCallback(() => {
    setGlasses((g) => Math.max(0, g - 1));
  }, []);

  const resetDay = useCallback(() => {
    if (glasses > 0) {
      setHistory((prev) => [{
        date: new Date().toLocaleDateString(),
        glasses,
        goal,
        pct: Math.round((glasses / goal) * 100),
      }, ...prev].slice(0, 7));
    }
    setGlasses(0);
  }, [glasses, goal]);

  const waveHeight = Math.min(100, (glasses / goal) * 100);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 shadow-2xl">
          <h1 className="text-lg font-semibold text-white mb-6 flex items-center justify-center gap-2">
            <Droplets size={20} className="text-sky-400" /> Water Intake
          </h1>

          <div className="relative w-40 h-40 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-zinc-800 overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-sky-500/30 transition-all duration-500"
                style={{ height: waveHeight + "%" }}
              >
                <div className="absolute inset-0 bg-sky-400/20" />
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-white">{glasses}</span>
              <span className="text-xs text-zinc-500">of {goal} glasses</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="w-full h-2 bg-zinc-800 rounded-full">
              <div className={"h-2 rounded-full transition-all duration-500 " + (pct >= 100 ? "bg-green-500" : "bg-sky-500")} style={{ width: pct + "%" }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-zinc-500">{pct}%</span>
              <span className="text-xs text-zinc-500">{remaining > 0 ? remaining + " more to go" : "Goal reached! 🎉"}</span>
            </div>
          </div>

          <div className="flex justify-center gap-3 mb-6">
            <button onClick={removeGlass} className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
              <Minus size={20} />
            </button>
            <button onClick={addGlass} className={"flex h-14 w-14 items-center justify-center rounded-full text-white transition-colors " + (pct >= 100 ? "bg-green-600 hover:bg-green-500" : "bg-sky-600 hover:bg-sky-500")}>
              <Plus size={20} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 mb-5">
            <span className="text-xs text-zinc-500">Daily goal:</span>
            <button onClick={() => setGoal((g) => Math.max(1, g - 1))} className="h-6 w-6 rounded bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 flex items-center justify-center">-</button>
            <span className="text-sm font-medium text-white w-4 text-center">{goal}</span>
            <button onClick={() => setGoal((g) => Math.min(20, g + 1))} className="h-6 w-6 rounded bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 flex items-center justify-center">+</button>
            <span className="text-xs text-zinc-500">glasses</span>
          </div>

          <button onClick={resetDay} className="flex items-center gap-1.5 mx-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            <RotateCcw size={12} /> End day & reset
          </button>

          {history.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/5">
              <span className="text-xs text-zinc-500 mb-2 block">Recent Days</span>
              <div className="flex gap-1.5 justify-center">
                {history.map((h, i) => (
                  <div key={i} className="flex flex-col items-center gap-1" title={h.date + ": " + h.glasses + "/" + h.goal}>
                    <div className={"h-8 w-5 rounded-sm " + (h.pct >= 100 ? "bg-green-500" : h.pct >= 50 ? "bg-sky-500" : "bg-sky-500/40")} style={{ opacity: 0.4 + (h.pct / 100) * 0.6 }} />
                    <span className="text-[9px] text-zinc-600">{h.pct}%</span>
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
