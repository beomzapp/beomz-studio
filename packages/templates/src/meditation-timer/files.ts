import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback, useRef } = React;
import { Play, Pause, RotateCcw, Wind } from "lucide-react";

const PRESETS = [
  { label: "Quick", minutes: 3, color: "bg-violet-600" },
  { label: "Short", minutes: 5, color: "bg-indigo-600" },
  { label: "Standard", minutes: 10, color: "bg-purple-600" },
  { label: "Deep", minutes: 20, color: "bg-fuchsia-600" },
];

export function App() {
  const [duration, setDuration] = useState(5 * 60);
  const [seconds, setSeconds] = useState(5 * 60);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [breathPhase, setBreathPhase] = useState("inhale");
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef(null);
  const breathRef = useRef(null);

  useEffect(() => {
    if (!running) { clearInterval(breathRef.current); return; }
    let inhale = true;
    setBreathPhase("inhale");
    breathRef.current = setInterval(() => {
      inhale = !inhale;
      setBreathPhase(inhale ? "inhale" : "exhale");
    }, 4000);
    return () => clearInterval(breathRef.current);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          clearInterval(breathRef.current);
          setRunning(false);
          setPhase("complete");
          setSessions((p) => p + 1);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const selectPreset = useCallback((mins) => {
    setDuration(mins * 60);
    setSeconds(mins * 60);
    setPhase("idle");
    setRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (phase === "complete") return;
    setPhase("active");
    setRunning((r) => !r);
  }, [phase]);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    clearInterval(breathRef.current);
    setRunning(false);
    setSeconds(duration);
    setPhase("idle");
  }, [duration]);

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const progress = duration > 0 ? (1 - seconds / duration) * 100 : 0;

  const breathScale = breathPhase === "inhale" ? "scale-100" : "scale-75";
  const breathOpacity = breathPhase === "inhale" ? "opacity-60" : "opacity-30";

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 shadow-2xl">
          <h1 className="text-lg font-medium text-zinc-400 mb-6 flex items-center justify-center gap-2">
            <Wind size={18} className="text-violet-400" /> Meditation
          </h1>

          <div className="flex justify-center gap-2 mb-6">
            {PRESETS.map((p) => (
              <button key={p.minutes} onClick={() => selectPreset(p.minutes)}
                className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-all " + (duration === p.minutes * 60 ? p.color + " text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300")}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative w-48 h-48 mx-auto mb-6">
            {running && (
              <div className={"absolute inset-4 rounded-full bg-violet-500/20 transition-all duration-[4000ms] ease-in-out " + breathScale + " " + breathOpacity} />
            )}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="90" fill="none" stroke="#27272a" strokeWidth="4" />
              <circle cx="100" cy="100" r="90" fill="none" stroke="#7c3aed" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 90} strokeDashoffset={2 * Math.PI * 90 * (1 - progress / 100)}
                style={{ transition: "stroke-dashoffset 1s linear" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {phase === "complete" ? (
                <span className="text-2xl">🧘</span>
              ) : (
                <>
                  <span className="text-4xl font-mono font-bold text-white">{pad(min)}:{pad(sec)}</span>
                  {running && <span className="text-xs text-violet-400 mt-2 capitalize">{breathPhase}...</span>}
                </>
              )}
            </div>
          </div>

          {phase === "complete" ? (
            <div className="mb-4">
              <p className="text-lg font-medium text-white mb-1">Session Complete</p>
              <p className="text-sm text-zinc-500">Well done. Take a moment.</p>
            </div>
          ) : running && (
            <p className="text-sm text-zinc-500 mb-4">Breathe deeply. {breathPhase === "inhale" ? "Breathe in..." : "Breathe out..."}</p>
          )}

          <div className="flex justify-center gap-3 mb-5">
            {phase !== "complete" && (
              <button onClick={toggle}
                className="flex items-center justify-center w-14 h-14 rounded-full bg-violet-600 text-white hover:bg-violet-500 transition-colors">
                {running ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
              </button>
            )}
            <button onClick={reset}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
              <RotateCcw size={20} />
            </button>
          </div>

          <p className="text-xs text-zinc-600">{sessions} session{sessions !== 1 ? "s" : ""} completed</p>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
