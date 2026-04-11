import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, Trash2, Clock, ChevronRight, X, Save } from "lucide-react";

let nextId = 20;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function formatDate(iso) { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }

export function App() {
  const [entries, setEntries] = useState([
    { id: 1, date: todayStr(), yesterday: "Finished auth flow implementation and code review", today: "Start dashboard metrics API + write tests", blockers: "Waiting on design specs for charts", time: "09:15" },
  ]);
  const [yesterday, setYesterday] = useState("");
  const [today, setToday] = useState("");
  const [blockers, setBlockers] = useState("");
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const todayEntry = entries.find((e) => e.date === todayStr());

  const saveStandup = useCallback(() => {
    if (!yesterday.trim() && !today.trim() && !blockers.trim()) return;
    const date = todayStr();
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.date !== date);
      return [{ id: nextId++, date, yesterday: yesterday.trim(), today: today.trim(), blockers: blockers.trim(), time }, ...filtered];
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [yesterday, today, blockers]);

  const deleteEntry = useCallback((id) => { setEntries((prev) => prev.filter((e) => e.id !== id)); }, []);

  const loadToday = useCallback(() => {
    if (todayEntry) {
      setYesterday(todayEntry.yesterday);
      setToday(todayEntry.today);
      setBlockers(todayEntry.blockers);
    }
  }, [todayEntry]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Clock size={20} className="text-amber-400" /> Daily Standup</h1>
          <button onClick={() => setShowHistory((h) => !h)} className={"text-xs font-medium transition-all " + (showHistory ? "text-amber-400" : "text-zinc-500 hover:text-zinc-300")}>
            {showHistory ? "Write" : "History"}
          </button>
        </div>

        {!showHistory ? (
          <div className="space-y-4">
            <div className="text-xs text-zinc-500 flex items-center justify-between">
              <span>{formatDate(todayStr())}</span>
              {todayEntry && <button onClick={loadToday} className="text-amber-400 hover:text-amber-300">Load saved</button>}
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <div className="mb-4">
                <label className="text-xs font-medium text-zinc-400 mb-2 block flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> What did you do yesterday?
                </label>
                <textarea value={yesterday} onChange={(e) => setYesterday(e.target.value)} placeholder="Completed tasks, progress made..." rows={3} className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed" />
              </div>

              <div className="mb-4">
                <label className="text-xs font-medium text-zinc-400 mb-2 block flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> What will you do today?
                </label>
                <textarea value={today} onChange={(e) => setToday(e.target.value)} placeholder="Planned tasks, focus areas..." rows={3} className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed" />
              </div>

              <div className="mb-4">
                <label className="text-xs font-medium text-zinc-400 mb-2 block flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> Any blockers?
                </label>
                <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="Dependencies, issues, help needed..." rows={2} className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed" />
              </div>
            </div>

            <button onClick={saveStandup} className={"w-full rounded-xl py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 " + (saved ? "bg-green-600 text-white" : "bg-amber-600 text-white hover:bg-amber-500")}>
              <Save size={15} /> {saved ? "Saved!" : "Save Standup"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.length === 0 && <p className="text-center text-sm text-zinc-600 py-8">No standups recorded yet</p>}
            {entries.map((entry) => (
              <div key={entry.id} className="group rounded-2xl bg-zinc-900 border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-zinc-400">{formatDate(entry.date)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-600">{entry.time}</span>
                    <button onClick={() => deleteEntry(entry.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
                {entry.yesterday && (
                  <div className="mb-2">
                    <span className="flex items-center gap-1 text-[10px] text-blue-400 mb-0.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Yesterday</span>
                    <p className="text-sm text-zinc-300 pl-3">{entry.yesterday}</p>
                  </div>
                )}
                {entry.today && (
                  <div className="mb-2">
                    <span className="flex items-center gap-1 text-[10px] text-green-400 mb-0.5"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Today</span>
                    <p className="text-sm text-zinc-300 pl-3">{entry.today}</p>
                  </div>
                )}
                {entry.blockers && (
                  <div>
                    <span className="flex items-center gap-1 text-[10px] text-red-400 mb-0.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Blockers</span>
                    <p className="text-sm text-zinc-300 pl-3">{entry.blockers}</p>
                  </div>
                )}
              </div>
            ))}
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
