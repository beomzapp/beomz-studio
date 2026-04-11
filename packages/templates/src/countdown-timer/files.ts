import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback, useRef } = React;

export function App() {
  const [targetDate, setTargetDate] = useState("");
  const [timeLeft, setTimeLeft] = useState(null);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  const calcTimeLeft = useCallback((target) => {
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
      done: false,
    };
  }, []);

  const start = useCallback(() => {
    if (!targetDate) return;
    setRunning(true);
    setTimeLeft(calcTimeLeft(targetDate));
  }, [targetDate, calcTimeLeft]);

  useEffect(() => {
    if (!running || !targetDate) return;
    intervalRef.current = setInterval(() => {
      const tl = calcTimeLeft(targetDate);
      setTimeLeft(tl);
      if (tl.done) { clearInterval(intervalRef.current); setRunning(false); }
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, targetDate, calcTimeLeft]);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setTimeLeft(null);
    setTargetDate("");
  }, []);

  const pad = (n) => String(n).padStart(2, "0");

  const Block = ({ value, label }) => (
    <div className="flex flex-col items-center">
      <div className="w-20 h-20 rounded-2xl bg-zinc-800 border border-white/5 flex items-center justify-center">
        <span className="text-3xl font-bold text-white">{pad(value)}</span>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2">{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="rounded-3xl bg-zinc-900 p-8 shadow-2xl border border-white/5">
          <h1 className="text-2xl font-semibold text-white mb-6">Countdown Timer</h1>

          {!running && !timeLeft && (
            <div className="space-y-4">
              <input
                type="datetime-local"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-xl bg-zinc-800 border border-white/5 py-3 px-4 text-white outline-none focus:border-red-500/40"
              />
              <button
                onClick={start}
                disabled={!targetDate}
                className="w-full rounded-xl bg-red-600 py-3 text-white font-medium transition-all hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start Countdown
              </button>
            </div>
          )}

          {timeLeft && (
            <div className="space-y-6">
              {timeLeft.done ? (
                <div className="py-8">
                  <div className="text-5xl mb-3">🎉</div>
                  <p className="text-xl font-semibold text-white">Time's up!</p>
                </div>
              ) : (
                <div className="flex justify-center gap-3">
                  <Block value={timeLeft.days} label="Days" />
                  <Block value={timeLeft.hours} label="Hours" />
                  <Block value={timeLeft.minutes} label="Min" />
                  <Block value={timeLeft.seconds} label="Sec" />
                </div>
              )}
              <button
                onClick={reset}
                className="w-full rounded-xl bg-zinc-800 py-3 text-zinc-300 font-medium transition-all hover:bg-zinc-700"
              >
                Reset
              </button>
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
