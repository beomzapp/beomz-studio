import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Smile } from "lucide-react";

let nextId = 1;
const MOODS = [
  { emoji: "😄", label: "Great", value: 5, color: "bg-green-500" },
  { emoji: "🙂", label: "Good", value: 4, color: "bg-emerald-500" },
  { emoji: "😐", label: "Okay", value: 3, color: "bg-amber-500" },
  { emoji: "😔", label: "Low", value: 2, color: "bg-orange-500" },
  { emoji: "😢", label: "Bad", value: 1, color: "bg-red-500" },
];

export function App() {
  const [entries, setEntries] = useState([]);
  const [selectedMood, setSelectedMood] = useState(null);
  const [notes, setNotes] = useState("");

  const addEntry = useCallback(() => {
    if (selectedMood === null) return;
    const mood = MOODS[selectedMood];
    setEntries((prev) => [{
      id: nextId++, mood: mood.value, emoji: mood.emoji, label: mood.label,
      notes: notes.trim(), date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }, ...prev]);
    setSelectedMood(null);
    setNotes("");
  }, [selectedMood, notes]);

  const deleteEntry = useCallback((id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const avg = entries.reduce((s, e) => s + e.mood, 0) / entries.length;
    const best = Math.max(...entries.map((e) => e.mood));
    const recent7 = entries.slice(0, 7);
    return { avg, best, count: entries.length, recent7 };
  }, [entries]);

  const moodColor = (v) => MOODS.find((m) => m.value === v)?.color || "bg-zinc-600";

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Smile size={20} /> Mood Journal</h1>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
              <span className="text-2xl">{MOODS.find((m) => m.value === Math.round(stats.avg))?.emoji || "😐"}</span>
              <p className="text-[10px] text-zinc-500 mt-1">Average</p>
            </div>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
              <span className="text-2xl font-bold text-white">{stats.count}</span>
              <p className="text-[10px] text-zinc-500 mt-1">Entries</p>
            </div>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
              <div className="flex justify-center gap-0.5 mt-1">
                {stats.recent7.map((e) => (
                  <div key={e.id} className={"h-6 flex-1 rounded-sm " + moodColor(e.mood)} style={{ opacity: 0.4 + (e.mood / 5) * 0.6 }} title={e.emoji + " " + e.date} />
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5">Last 7</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">How are you feeling?</h2>
          <div className="flex justify-between mb-4">
            {MOODS.map((mood, i) => (
              <button key={i} onClick={() => setSelectedMood(i)}
                className={"flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all " + (selectedMood === i ? "bg-zinc-800 ring-1 ring-pink-500/40 scale-110" : "hover:bg-zinc-800/60")}>
                <span className="text-2xl">{mood.emoji}</span>
                <span className="text-[10px] text-zinc-500">{mood.label}</span>
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's on your mind? (optional)"
            rows={2}
            className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none mb-3"
          />
          <button onClick={addEntry} disabled={selectedMood === null}
            className="w-full rounded-xl bg-pink-600 py-2.5 text-white text-sm font-medium hover:bg-pink-500 transition-colors disabled:opacity-40">
            Log Mood
          </button>
        </div>

        <div className="space-y-2">
          {entries.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No entries yet — log your first mood above</p>}
          {entries.map((entry) => (
            <div key={entry.id} className="group flex items-start gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              <span className="text-xl flex-shrink-0 mt-0.5">{entry.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{entry.label}</span>
                  <span className="text-xs text-zinc-600">{entry.date} {entry.time}</span>
                </div>
                {entry.notes && <p className="text-xs text-zinc-400 mt-1">{entry.notes}</p>}
              </div>
              <button onClick={() => deleteEntry(entry.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 flex-shrink-0 mt-1">
                <Trash2 size={13} />
              </button>
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
