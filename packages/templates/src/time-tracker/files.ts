import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback, useRef, useMemo } = React;
import { Play, Square, Trash2, Clock, Plus, X } from "lucide-react";

let nextId = 10;
const PROJECTS = ["Design", "Development", "Meetings", "Admin", "Research"];

export function App() {
  const [entries, setEntries] = useState([]);
  const [running, setRunning] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [project, setProject] = useState("Development");
  const [task, setTask] = useState("");
  const startRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now() - elapsed * 1000;
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const startTimer = useCallback(() => {
    if (!task.trim()) return;
    setRunning({ project, task: task.trim() });
    setElapsed(0);
  }, [project, task]);

  const stopTimer = useCallback(() => {
    if (!running) return;
    clearInterval(intervalRef.current);
    setEntries((prev) => [{
      id: nextId++, project: running.project, task: running.task,
      seconds: elapsed, date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }, ...prev]);
    setRunning(null);
    setElapsed(0);
    setTask("");
  }, [running, elapsed]);

  const deleteEntry = useCallback((id) => { setEntries((prev) => prev.filter((e) => e.id !== id)); }, []);

  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
    if (m > 0) return m + "m " + String(s).padStart(2, "0") + "s";
    return s + "s";
  };

  const todayTotal = useMemo(() => {
    const today = new Date().toLocaleDateString();
    return entries.filter((e) => e.date === today).reduce((s, e) => s + e.seconds, 0);
  }, [entries]);

  const byProject = useMemo(() => {
    const map = {};
    for (const e of entries) { map[e.project] = (map[e.project] || 0) + e.seconds; }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const projectColors = { Design: "bg-pink-500", Development: "bg-blue-500", Meetings: "bg-amber-500", Admin: "bg-purple-500", Research: "bg-green-500" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Clock size={20} /> Time Tracker</h1>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
          {running ? (
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider text-cyan-400">{running.project}</span>
              <p className="text-sm text-zinc-300 mb-2">{running.task}</p>
              <p className="text-4xl font-mono font-bold text-white mb-4">{fmtTime(elapsed)}</p>
              <button onClick={stopTimer} className="flex items-center gap-2 mx-auto rounded-xl bg-red-600 px-6 py-2.5 text-white font-medium hover:bg-red-500 transition-colors">
                <Square size={16} /> Stop
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Start Timer</h2>
              <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="What are you working on?" className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-3" />
              <div className="flex gap-2">
                <select value={project} onChange={(e) => setProject(e.target.value)} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                  {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={startTimer} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-white font-medium hover:bg-cyan-500 transition-colors">
                  <Play size={16} /> Start
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{fmtTime(todayTotal + (running ? elapsed : 0))}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Today</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{entries.length}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Entries</p>
          </div>
        </div>

        {byProject.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
            <span className="text-xs text-zinc-500 mb-2 block">By Project</span>
            <div className="space-y-2">
              {byProject.map(([proj, secs]) => (
                <div key={proj} className="flex items-center gap-2">
                  <div className={"h-2.5 w-2.5 rounded-full flex-shrink-0 " + (projectColors[proj] || "bg-zinc-500")} />
                  <span className="flex-1 text-sm text-zinc-300">{proj}</span>
                  <span className="text-sm text-zinc-400">{fmtTime(secs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {entries.length === 0 && !running && <p className="text-center text-sm text-zinc-600 py-6">No time logged yet</p>}
          {entries.map((e) => (
            <div key={e.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5">
              <div className={"h-2 w-2 rounded-full flex-shrink-0 " + (projectColors[e.project] || "bg-zinc-500")} />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{e.task}</span>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{e.project}</span><span>·</span><span>{e.time}</span>
                </div>
              </div>
              <span className="text-sm font-mono text-cyan-400">{fmtTime(e.seconds)}</span>
              <button onClick={() => deleteEntry(e.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
