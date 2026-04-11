import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback, useRef } = React;
import { Play, Pause, RotateCcw, Coffee, Brain } from "lucide-react";

const WORK_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;
const LONG_BREAK_SECONDS = 15 * 60;

export function App() {
  const [mode, setMode] = useState("work");
  const [seconds, setSeconds] = useState(WORK_SECONDS);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef(null);

  const totalSeconds = mode === "work" ? WORK_SECONDS : mode === "long-break" ? LONG_BREAK_SECONDS : BREAK_SECONDS;
  const progress = 1 - seconds / totalSeconds;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          if (mode === "work") {
            const next = sessions + 1;
            setSessions(next);
            if (next % 4 === 0) {
              setMode("long-break");
              return LONG_BREAK_SECONDS;
            }
            setMode("break");
            return BREAK_SECONDS;
          }
          setMode("work");
          return WORK_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, mode, sessions]);

  const toggle = useCallback(() => setRunning((r) => !r), []);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setMode("work");
    setSeconds(WORK_SECONDS);
    setSessions(0);
  }, []);

  const switchMode = useCallback((m) => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setMode(m);
    setSeconds(m === "work" ? WORK_SECONDS : m === "long-break" ? LONG_BREAK_SECONDS : BREAK_SECONDS);
  }, []);

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");

  const modeColor = mode === "work" ? "text-red-500" : "text-green-400";
  const ringColor = mode === "work" ? "stroke-red-500" : "stroke-green-400";
  const bgAccent = mode === "work" ? "bg-red-600" : "bg-green-600";

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 shadow-2xl">
          <div className="flex justify-center gap-2 mb-6">
            {[{ k: "work", label: "Focus", icon: Brain }, { k: "break", label: "Break", icon: Coffee }, { k: "long-break", label: "Long Break", icon: Coffee }].map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                onClick={() => switchMode(k)}
                className={"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all " +
                  (mode === k ? bgAccent + " text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300")}
              >
                <Icon size={12} />{label}
              </button>
            ))}
          </div>

          <div className="relative w-52 h-52 mx-auto mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r={radius} fill="none" stroke="#27272a" strokeWidth="6" />
              <circle
                cx="100" cy="100" r={radius} fill="none"
                className={ringColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={"text-4xl font-bold " + modeColor}>{pad(min)}:{pad(sec)}</span>
              <span className="text-xs text-zinc-500 mt-1 capitalize">{mode === "long-break" ? "Long Break" : mode}</span>
            </div>
          </div>

          <div className="flex justify-center gap-3 mb-5">
            <button
              onClick={toggle}
              className={"flex items-center justify-center w-14 h-14 rounded-full text-white transition-all " + bgAccent + " hover:opacity-90"}
            >
              {running ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
            </button>
            <button
              onClick={reset}
              className="flex items-center justify-center w-14 h-14 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <RotateCcw size={20} />
            </button>
          </div>

          <div className="flex justify-center gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={"h-2 w-2 rounded-full transition-colors " + (i <= sessions % 4 || (sessions > 0 && sessions % 4 === 0 && i <= 4) ? "bg-red-500" : "bg-zinc-800")}
              />
            ))}
          </div>
          <p className="text-xs text-zinc-600 mt-2">{sessions} session{sessions !== 1 ? "s" : ""} completed</p>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
