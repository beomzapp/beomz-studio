import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, BookOpen, Clock, Check, X, Timer } from "lucide-react";

let nextId = 10;
const COLORS = ["bg-blue-600", "bg-purple-600", "bg-green-600", "bg-amber-600", "bg-red-600", "bg-pink-600"];
const SAMPLE = [
  { id: 1, name: "Mathematics", color: 0, sessions: [{ id: 2, topic: "Calculus Ch.5", minutes: 45, done: true }, { id: 3, topic: "Linear Algebra", minutes: 30, done: false }] },
  { id: 4, name: "Computer Science", color: 1, sessions: [{ id: 5, topic: "Data Structures", minutes: 60, done: false }, { id: 6, topic: "Algorithms Review", minutes: 40, done: false }] },
  { id: 7, name: "Physics", color: 2, sessions: [{ id: 8, topic: "Thermodynamics", minutes: 50, done: true }] },
];

export function App() {
  const [subjects, setSubjects] = useState(SAMPLE);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addingSession, setAddingSession] = useState(null);
  const [sessionTopic, setSessionTopic] = useState("");
  const [sessionMinutes, setSessionMinutes] = useState("30");

  const addSubject = useCallback(() => {
    if (!newName.trim()) return;
    setSubjects((prev) => [...prev, { id: nextId++, name: newName.trim(), color: prev.length % COLORS.length, sessions: [] }]);
    setNewName("");
    setAdding(false);
  }, [newName]);

  const deleteSubject = useCallback((id) => {
    setSubjects((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addSession = useCallback((subjectId) => {
    if (!sessionTopic.trim()) return;
    setSubjects((prev) => prev.map((s) => s.id === subjectId ? { ...s, sessions: [...s.sessions, { id: nextId++, topic: sessionTopic.trim(), minutes: parseInt(sessionMinutes) || 30, done: false }] } : s));
    setSessionTopic("");
    setSessionMinutes("30");
    setAddingSession(null);
  }, [sessionTopic, sessionMinutes]);

  const toggleSession = useCallback((subjectId, sessionId) => {
    setSubjects((prev) => prev.map((s) => s.id === subjectId ? { ...s, sessions: s.sessions.map((ss) => ss.id === sessionId ? { ...ss, done: !ss.done } : ss) } : s));
  }, []);

  const deleteSession = useCallback((subjectId, sessionId) => {
    setSubjects((prev) => prev.map((s) => s.id === subjectId ? { ...s, sessions: s.sessions.filter((ss) => ss.id !== sessionId) } : s));
  }, []);

  const stats = useMemo(() => {
    let total = 0, done = 0, totalMinutes = 0, doneMinutes = 0;
    for (const s of subjects) {
      for (const ss of s.sessions) {
        total++;
        totalMinutes += ss.minutes;
        if (ss.done) { done++; doneMinutes += ss.minutes; }
      }
    }
    return { total, done, totalMinutes, doneMinutes, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [subjects]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BookOpen size={20} /> Study Planner</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors">
            <Plus size={14} /> Subject
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-indigo-400">{stats.pct}%</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Complete</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{stats.done}/{stats.total}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Sessions</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{Math.floor(stats.doneMinutes / 60)}h {stats.doneMinutes % 60}m</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Studied</p>
          </div>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <form onSubmit={(e) => { e.preventDefault(); addSubject(); }} className="flex gap-2">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Subject name..." className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white font-medium">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {subjects.length === 0 && <p className="text-center text-sm text-zinc-600 py-8">No subjects yet</p>}
          {subjects.map((subject) => {
            const done = subject.sessions.filter((s) => s.done).length;
            const pct = subject.sessions.length > 0 ? Math.round((done / subject.sessions.length) * 100) : 0;
            return (
              <div key={subject.id} className="rounded-2xl bg-zinc-900 border border-white/5 overflow-hidden">
                <div className="group flex items-center gap-3 px-4 py-3">
                  <div className={"h-3 w-3 rounded-full flex-shrink-0 " + COLORS[subject.color]} />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-white">{subject.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-zinc-800 rounded-full">
                        <div className={"h-1 rounded-full transition-all " + COLORS[subject.color]} style={{ width: pct + "%" }} />
                      </div>
                      <span className="text-[10px] text-zinc-500">{done}/{subject.sessions.length}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteSubject(subject.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
                <div className="px-4 pb-3 space-y-1">
                  {subject.sessions.map((ss) => (
                    <div key={ss.id} className="group flex items-center gap-2">
                      <button onClick={() => toggleSession(subject.id, ss.id)} className={"flex h-5 w-5 items-center justify-center rounded flex-shrink-0 " + (ss.done ? COLORS[subject.color] + " text-white" : "border border-zinc-700")}>
                        {ss.done && <Check size={11} />}
                      </button>
                      <span className={"flex-1 text-sm " + (ss.done ? "text-zinc-600 line-through" : "text-zinc-300")}>{ss.topic}</span>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-600"><Timer size={9} />{ss.minutes}m</span>
                      <button onClick={() => deleteSession(subject.id, ss.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={12} /></button>
                    </div>
                  ))}
                  {addingSession === subject.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); addSession(subject.id); }} className="flex gap-2 mt-1">
                      <input autoFocus value={sessionTopic} onChange={(e) => setSessionTopic(e.target.value)} placeholder="Topic..." className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none" />
                      <input type="number" value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} className="w-14 rounded-lg bg-zinc-800 border border-white/5 px-2 py-1.5 text-xs text-white outline-none text-center" />
                      <button type="submit" className="text-xs text-indigo-400 hover:text-indigo-300">Add</button>
                    </form>
                  ) : (
                    <button onClick={() => setAddingSession(subject.id)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 mt-1">
                      <Plus size={12} /> Add session
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
