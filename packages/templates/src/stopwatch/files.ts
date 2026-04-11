import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback, useRef } = React;
import { Play, Pause, RotateCcw, Flag } from "lucide-react";

export function App() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState([]);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startTimeRef.current = Date.now() - elapsed;
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 10);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const toggle = useCallback(() => setRunning((r) => !r), []);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setElapsed(0);
    setLaps([]);
  }, []);

  const lap = useCallback(() => {
    setLaps((prev) => [elapsed, ...prev]);
  }, [elapsed]);

  const fmt = (ms) => {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return String(min).padStart(2, "0") + ":" + String(sec).padStart(2, "0") + "." + String(cs).padStart(2, "0");
  };

  const bestLap = laps.length > 1 ? Math.min(...laps.map((l, i) => i === 0 ? l - (laps[1] || 0) : laps[i - 1] ? laps[i - 1] - l : l).filter((v) => v > 0)) : null;
  const worstLap = laps.length > 1 ? Math.max(...laps.map((l, i) => i === 0 ? l - (laps[1] || 0) : laps[i - 1] ? laps[i - 1] - l : l).filter((v) => v > 0)) : null;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 shadow-2xl">
          <h1 className="text-lg font-medium text-zinc-400 mb-6">Stopwatch</h1>

          <div className="mb-8">
            <span className="text-5xl font-mono font-bold text-white tracking-wider">{fmt(elapsed)}</span>
          </div>

          <div className="flex justify-center gap-3 mb-6">
            <button
              onClick={toggle}
              className={"flex items-center justify-center w-14 h-14 rounded-full text-white transition-all " + (running ? "bg-amber-600 hover:bg-amber-500" : "bg-sky-600 hover:bg-sky-500")}
            >
              {running ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
            </button>
            {running && (
              <button onClick={lap} className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800 text-zinc-300 hover:text-white transition-colors">
                <Flag size={20} />
              </button>
            )}
            {!running && elapsed > 0 && (
              <button onClick={reset} className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                <RotateCcw size={20} />
              </button>
            )}
          </div>

          {laps.length > 0 && (
            <div className="max-h-52 overflow-y-auto">
              <div className="space-y-1">
                {laps.map((lapTime, i) => {
                  const prev = laps[i + 1] || 0;
                  const diff = lapTime - prev;
                  const isBest = bestLap !== null && diff === bestLap;
                  const isWorst = worstLap !== null && diff === worstLap && laps.length > 2;
                  return (
                    <div key={i} className={"flex items-center justify-between rounded-lg px-4 py-2 " + (isBest ? "bg-green-600/10" : isWorst ? "bg-red-600/10" : "hover:bg-zinc-800/40")}>
                      <span className="text-xs text-zinc-500">Lap {laps.length - i}</span>
                      <span className={"text-sm font-mono " + (isBest ? "text-green-400" : isWorst ? "text-red-400" : "text-zinc-300")}>{fmt(diff)}</span>
                      <span className="text-xs text-zinc-600 font-mono">{fmt(lapTime)}</span>
                    </div>
                  );
                })}
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
