import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Check, Circle, PenLine, Smile, Heart, X } from "lucide-react";

let nextId = 20;
const todayKey = () => new Date().toISOString().slice(0, 10);

const MOODS = ["😄", "🙂", "😐", "😔", "😢"];
const PROMPTS = [
  "What are you grateful for today?",
  "What's one thing you learned?",
  "What made you smile?",
  "What challenge did you overcome?",
  "What do you want to focus on tomorrow?",
];

export function App() {
  const [habits, setHabits] = useState([
    { id: 1, name: "Morning exercise", emoji: "🏃" },
    { id: 2, name: "Read 30 min", emoji: "📖" },
    { id: 3, name: "Drink 8 glasses", emoji: "💧" },
    { id: 4, name: "No screen before bed", emoji: "📵" },
  ]);
  const [habitLog, setHabitLog] = useState({});
  const [mood, setMood] = useState(null);
  const [gratitude, setGratitude] = useState("");
  const [reflection, setReflection] = useState("");
  const [entries, setEntries] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = todayKey();
  const prompt = useMemo(() => PROMPTS[new Date().getDay() % PROMPTS.length], []);
  const todayEntry = entries.find((e) => e.date === today);

  const toggleHabit = useCallback((id) => {
    const key = today + ":" + id;
    setHabitLog((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
  }, [today]);

  const addHabit = useCallback(() => {
    if (!newHabit.trim()) return;
    setHabits((prev) => [...prev, { id: nextId++, name: newHabit.trim(), emoji: "✅" }]);
    setNewHabit("");
    setAdding(false);
  }, [newHabit]);

  const removeHabit = useCallback((id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const saveDay = useCallback(() => {
    const habitsDone = habits.filter((h) => habitLog[today + ":" + h.id]).length;
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.date !== today);
      return [{ date: today, mood, gratitude: gratitude.trim(), reflection: reflection.trim(), habitsDone, habitsTotal: habits.length }, ...filtered];
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [today, mood, gratitude, reflection, habits, habitLog]);

  const completedToday = habits.filter((h) => habitLog[today + ":" + h.id]).length;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Heart size={20} className="text-pink-400" /> Habit Journal</h1>
          <span className="text-xs text-zinc-500">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-zinc-400">Daily Habits</h2>
            <span className="text-xs text-zinc-600">{completedToday}/{habits.length}</span>
          </div>
          <div className="space-y-1.5 mb-3">
            {habits.map((h) => {
              const done = !!habitLog[today + ":" + h.id];
              return (
                <div key={h.id} className="group flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-zinc-800/40 transition-colors">
                  <button onClick={() => toggleHabit(h.id)} className={"flex h-6 w-6 items-center justify-center rounded-lg flex-shrink-0 transition-all " + (done ? "bg-pink-600 text-white" : "border border-zinc-700 hover:border-zinc-500")}>
                    {done && <Check size={12} />}
                  </button>
                  <span className="text-sm mr-1">{h.emoji}</span>
                  <span className={"flex-1 text-sm " + (done ? "text-zinc-500 line-through" : "text-white")}>{h.name}</span>
                  <button onClick={() => removeHabit(h.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={12} /></button>
                </div>
              );
            })}
          </div>
          {adding ? (
            <form onSubmit={(e) => { e.preventDefault(); addHabit(); }} className="flex gap-2">
              <input autoFocus value={newHabit} onChange={(e) => setNewHabit(e.target.value)} placeholder="New habit..." className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="text-xs text-pink-400">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs text-zinc-600">Cancel</button>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400"><Plus size={12} /> Add habit</button>
          )}
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-1"><Smile size={13} /> How are you feeling?</h2>
          <div className="flex justify-between mb-1">
            {MOODS.map((m, i) => (
              <button key={i} onClick={() => setMood(i)} className={"text-2xl rounded-xl px-3 py-2 transition-all " + (mood === i ? "bg-zinc-800 scale-110 ring-1 ring-pink-500/30" : "hover:bg-zinc-800/40")}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1"><PenLine size={13} /> {prompt}</h2>
          <textarea value={gratitude} onChange={(e) => setGratitude(e.target.value)} placeholder="Write your thoughts..." rows={2} className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed" />
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-2">Evening Reflection</h2>
          <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="How did today go? What will you do differently tomorrow?" rows={3} className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed" />
        </div>

        <button onClick={saveDay} className={"w-full rounded-xl py-3 text-sm font-medium transition-all " + (saved ? "bg-green-600 text-white" : "bg-pink-600 text-white hover:bg-pink-500")}>
          {saved ? "Saved!" : "Save Today's Entry"}
        </button>

        {entries.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs text-zinc-500 mb-2">Recent Entries</h3>
            <div className="space-y-1.5">
              {entries.slice(0, 5).map((e) => (
                <div key={e.date} className="rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5 flex items-center gap-3">
                  <span className="text-lg">{e.mood !== null ? MOODS[e.mood] : "—"}</span>
                  <div className="flex-1">
                    <span className="text-xs text-zinc-500">{e.date}</span>
                    <p className="text-xs text-zinc-400 truncate">{e.gratitude || e.reflection || "No notes"}</p>
                  </div>
                  <span className="text-xs text-zinc-600">{e.habitsDone}/{e.habitsTotal}</span>
                </div>
              ))}
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
