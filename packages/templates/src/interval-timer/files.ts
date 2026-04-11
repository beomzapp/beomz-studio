import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback, useRef } = React;
import { Play, Pause, RotateCcw, Settings } from "lucide-react";

export function App() {
  const [workSec, setWorkSec] = useState(30);
  const [restSec, setRestSec] = useState(10);
  const [totalRounds, setTotalRounds] = useState(8);
  const [phase, setPhase] = useState("idle");
  const [currentPhase, setCurrentPhase] = useState("work");
  const [timeLeft, setTimeLeft] = useState(30);
  const [round, setRound] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (phase !== "running") return;
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (currentPhase === "work") {
            if (round >= totalRounds) {
              clearInterval(intervalRef.current);
              setPhase("done");
              return 0;
            }
            setCurrentPhase("rest");
            return restSec;
          }
          setCurrentPhase("work");
          setRound((r) => r + 1);
          return workSec;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [phase, currentPhase, round, totalRounds, workSec, restSec]);

  const start = useCallback(() => {
    setPhase("running");
    setCurrentPhase("work");
    setTimeLeft(workSec);
    setRound(1);
  }, [workSec]);

  const togglePause = useCallback(() => {
    setPhase((p) => p === "running" ? "paused" : "running");
  }, []);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    setPhase("idle");
    setCurrentPhase("work");
    setTimeLeft(workSec);
    setRound(1);
  }, [workSec]);

  const pad = (n) => String(n).padStart(2, "0");
  const min = Math.floor(timeLeft / 60);
  const sec = timeLeft % 60;

  const isWork = currentPhase === "work";
  const phaseColor = isWork ? "text-red-500" : "text-green-400";
  const phaseBg = isWork ? "bg-red-600" : "bg-green-600";
  const progress = phase === "idle" ? 0 : 1 - timeLeft / (isWork ? workSec : restSec);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold text-white">Interval Timer</h1>
            <button onClick={() => setShowSettings((s) => !s)} className={"text-zinc-500 hover:text-white transition-colors " + (showSettings ? "text-white" : "")}>
              <Settings size={18} />
            </button>
          </div>

          {showSettings && phase === "idle" && (
            <div className="rounded-2xl bg-zinc-800/60 p-4 mb-5 space-y-3">
              {[
                { label: "Work (sec)", value: workSec, set: setWorkSec, min: 5, max: 120 },
                { label: "Rest (sec)", value: restSec, set: setRestSec, min: 5, max: 60 },
                { label: "Rounds", value: totalRounds, set: setTotalRounds, min: 1, max: 20 },
              ].map(({ label, value, set, min, max }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{label}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => set((v) => Math.max(min, v - (label === "Rounds" ? 1 : 5)))} className="h-7 w-7 rounded-lg bg-zinc-700 text-zinc-300 text-sm hover:bg-zinc-600">-</button>
                    <span className="text-sm text-white w-8 text-center">{value}</span>
                    <button onClick={() => set((v) => Math.min(max, v + (label === "Rounds" ? 1 : 5)))} className="h-7 w-7 rounded-lg bg-zinc-700 text-zinc-300 text-sm hover:bg-zinc-600">+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mb-2">
            <span className={"text-xs uppercase tracking-widest font-medium " + phaseColor}>
              {phase === "idle" ? "Ready" : phase === "done" ? "Complete!" : isWork ? "Work" : "Rest"}
            </span>
          </div>

          <div className="mb-5">
            <span className={"text-6xl font-mono font-bold " + (phase === "done" ? "text-green-400" : "text-white")}>
              {pad(min)}:{pad(sec)}
            </span>
          </div>

          <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-4">
            <div className={phaseBg + " h-1.5 rounded-full transition-all duration-500"} style={{ width: (progress * 100) + "%" }} />
          </div>

          <div className="text-xs text-zinc-500 mb-5">
            Round {round} / {totalRounds}
          </div>

          <div className="flex justify-center gap-3">
            {phase === "idle" && (
              <button onClick={start} className={"flex items-center justify-center w-14 h-14 rounded-full text-white " + phaseBg}>
                <Play size={22} className="ml-0.5" />
              </button>
            )}
            {(phase === "running" || phase === "paused") && (
              <>
                <button onClick={togglePause} className={"flex items-center justify-center w-14 h-14 rounded-full text-white " + (phase === "running" ? "bg-amber-600" : phaseBg)}>
                  {phase === "running" ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
                </button>
                <button onClick={reset} className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                  <RotateCcw size={20} />
                </button>
              </>
            )}
            {phase === "done" && (
              <button onClick={reset} className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-500 transition-colors">
                <RotateCcw size={16} /> Again
              </button>
            )}
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
