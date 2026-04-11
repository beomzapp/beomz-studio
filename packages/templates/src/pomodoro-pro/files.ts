import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback, useRef, useMemo } = React;
import { Play, Pause, RotateCcw, Plus, X, Check, ListTodo, BarChart3 } from "lucide-react";

let nextId = 10;
const WORK = 25 * 60;
const BREAK = 5 * 60;

export function App() {
  const [tasks, setTasks] = useState([
    { id: 1, text: "Review pull requests", done: false, pomos: 0 },
    { id: 2, text: "Write documentation", done: false, pomos: 0 },
    { id: 3, text: "Fix login bug", done: false, pomos: 0 },
  ]);
  const [activeTask, setActiveTask] = useState(1);
  const [seconds, setSeconds] = useState(WORK);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("work");
  const [completedPomos, setCompletedPomos] = useState(0);
  const [sessionLog, setSessionLog] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [tab, setTab] = useState("timer");
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          if (phase === "work") {
            setCompletedPomos((p) => p + 1);
            setTasks((prev) => prev.map((t) => t.id === activeTask ? { ...t, pomos: t.pomos + 1 } : t));
            const taskName = tasks.find((t) => t.id === activeTask)?.text || "Unknown";
            setSessionLog((prev) => [{ id: nextId++, task: taskName, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: "work" }, ...prev]);
            setPhase("break");
            return BREAK;
          }
          setPhase("work");
          return WORK;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, phase, activeTask, tasks]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => { clearInterval(intervalRef.current); setRunning(false); setPhase("work"); setSeconds(WORK); }, []);

  const addTask = useCallback(() => { if (!newTask.trim()) return; setTasks((prev) => [...prev, { id: nextId++, text: newTask.trim(), done: false, pomos: 0 }]); setNewTask(""); }, [newTask]);
  const toggleTask = useCallback((id) => { setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t)); }, []);
  const removeTask = useCallback((id) => { setTasks((prev) => prev.filter((t) => t.id !== id)); if (activeTask === id) setActiveTask(tasks[0]?.id || null); }, [activeTask, tasks]);

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const totalTime = phase === "work" ? WORK : BREAK;
  const progress = ((totalTime - seconds) / totalTime) * 100;
  const isWork = phase === "work";

  const focusScore = useMemo(() => {
    const target = 8;
    return Math.min(100, Math.round((completedPomos / target) * 100));
  }, [completedPomos]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white">Pomodoro Pro</h1>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {[{ k: "timer", icon: Play }, { k: "tasks", icon: ListTodo }, { k: "stats", icon: BarChart3 }].map(({ k, icon: Icon }) => (
              <button key={k} onClick={() => setTab(k)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (tab === k ? "bg-zinc-800 text-white" : "text-zinc-500")}>
                <Icon size={12} className="inline mr-1" />{k}
              </button>
            ))}
          </div>
        </div>

        {tab === "timer" && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 text-center">
            <span className={"text-xs uppercase tracking-widest font-medium " + (isWork ? "text-red-400" : "text-green-400")}>
              {isWork ? "Focus" : "Break"}
            </span>
            {activeTask && (
              <p className="text-sm text-zinc-400 mt-1">{tasks.find((t) => t.id === activeTask)?.text}</p>
            )}

            <div className="my-6">
              <span className="text-6xl font-mono font-bold text-white">{pad(min)}:{pad(sec)}</span>
            </div>

            <div className="w-full h-1.5 bg-zinc-800 rounded-full mb-5">
              <div className={"h-1.5 rounded-full transition-all " + (isWork ? "bg-red-500" : "bg-green-500")} style={{ width: progress + "%" }} />
            </div>

            <div className="flex justify-center gap-3 mb-4">
              <button onClick={toggle} className={"flex h-14 w-14 items-center justify-center rounded-full text-white " + (isWork ? "bg-red-600" : "bg-green-600")}>
                {running ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
              </button>
              <button onClick={reset} className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                <RotateCcw size={20} />
              </button>
            </div>

            <div className="flex justify-center gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={"h-2 w-2 rounded-full " + (i <= completedPomos % 4 ? "bg-red-500" : "bg-zinc-800")} />
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-2">{completedPomos} pomodoro{completedPomos !== 1 ? "s" : ""} today</p>
          </div>
        )}

        {tab === "tasks" && (
          <div>
            <form onSubmit={(e) => { e.preventDefault(); addTask(); }} className="flex gap-2 mb-4">
              <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task..." className="flex-1 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-red-600 px-4 py-2.5 text-white"><Plus size={16} /></button>
            </form>
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <div key={t.id} onClick={() => setActiveTask(t.id)} className={"group flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all " + (activeTask === t.id ? "bg-zinc-900 border-red-500/30" : "bg-zinc-900 border-white/5 hover:border-white/10")}>
                  <button onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }} className={"flex h-5 w-5 items-center justify-center rounded flex-shrink-0 " + (t.done ? "bg-green-600 text-white" : "border border-zinc-700")}>
                    {t.done && <Check size={11} />}
                  </button>
                  <span className={"flex-1 text-sm " + (t.done ? "text-zinc-600 line-through" : "text-white")}>{t.text}</span>
                  <span className="text-xs text-zinc-600">{t.pomos} pomo{t.pomos !== 1 ? "s" : ""}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeTask(t.id); }} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
                <span className="text-2xl font-bold text-red-400">{completedPomos}</span>
                <p className="text-[10px] text-zinc-500 mt-0.5">Pomodoros</p>
              </div>
              <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
                <span className="text-2xl font-bold text-white">{Math.round(completedPomos * 25 / 60 * 10) / 10}h</span>
                <p className="text-[10px] text-zinc-500 mt-0.5">Focus Time</p>
              </div>
              <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
                <span className="text-2xl font-bold text-amber-400">{focusScore}%</span>
                <p className="text-[10px] text-zinc-500 mt-0.5">Focus Score</p>
              </div>
            </div>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <h3 className="text-xs text-zinc-400 mb-3">Session Log</h3>
              {sessionLog.length === 0 ? (
                <p className="text-sm text-zinc-600 text-center py-4">Complete a pomodoro to see your log</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {sessionLog.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-zinc-600 w-12">{s.time}</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-zinc-300 flex-1 truncate">{s.task}</span>
                      <span className="text-xs text-zinc-600">25m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
`,
  },
];
