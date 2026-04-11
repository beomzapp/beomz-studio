import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, X, Flame, Check, Trophy } from "lucide-react";

let nextId = 10;
const todayKey = () => new Date().toISOString().slice(0, 10);

function getDayKeys(count) {
  const keys = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export function App() {
  const [habits, setHabits] = useState([
    { id: 1, name: "Morning run", emoji: "🏃", log: {} },
    { id: 2, name: "Read 30 pages", emoji: "📖", log: {} },
    { id: 3, name: "No sugar", emoji: "🍎", log: {} },
    { id: 4, name: "Meditate", emoji: "🧘", log: {} },
  ]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("✅");

  const today = todayKey();
  const last42 = useMemo(() => getDayKeys(42), []);

  const toggle = useCallback((habitId, day) => {
    setHabits((prev) => prev.map((h) => {
      if (h.id !== habitId) return h;
      const next = { ...h.log };
      if (next[day]) delete next[day]; else next[day] = true;
      return { ...h, log: next };
    }));
  }, []);

  const addHabit = useCallback(() => {
    if (!newName.trim()) return;
    setHabits((prev) => [...prev, { id: nextId++, name: newName.trim(), emoji: newEmoji || "✅", log: {} }]);
    setNewName("");
    setNewEmoji("✅");
    setAdding(false);
  }, [newName, newEmoji]);

  const removeHabit = useCallback((id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const getStreak = useCallback((habit) => {
    let streak = 0;
    for (let i = 0; ; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (habit.log[d.toISOString().slice(0, 10)]) streak++;
      else break;
    }
    return streak;
  }, []);

  const getLongest = useCallback((habit) => {
    let longest = 0, current = 0;
    const sorted = Object.keys(habit.log).sort();
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) { current = 1; }
      else {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diff = (curr.getTime() - prev.getTime()) / 86400000;
        current = diff === 1 ? current + 1 : 1;
      }
      longest = Math.max(longest, current);
    }
    return longest;
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Flame size={20} className="text-amber-400" /> Habit Streaks</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <form onSubmit={(e) => { e.preventDefault(); addHabit(); }} className="flex gap-2 items-center">
              <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} className="w-10 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-center text-sm outline-none" maxLength={2} />
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Habit name..." className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white font-medium">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {habits.map((habit) => {
            const streak = getStreak(habit);
            const longest = getLongest(habit);
            const doneToday = !!habit.log[today];
            return (
              <div key={habit.id} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{habit.emoji}</span>
                    <span className="text-sm font-medium text-white">{habit.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Flame size={13} className={streak > 0 ? "text-amber-400" : "text-zinc-700"} />
                      <span className={"text-xs font-bold " + (streak > 0 ? "text-amber-400" : "text-zinc-600")}>{streak}d</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Trophy size={11} className="text-zinc-600" />
                      <span className="text-[10px] text-zinc-600">{longest}d best</span>
                    </div>
                    <button onClick={() => removeHabit(habit.id)} className="text-zinc-700 hover:text-red-400"><X size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {last42.map((day) => {
                    const done = !!habit.log[day];
                    const isToday = day === today;
                    return (
                      <button
                        key={day}
                        onClick={() => toggle(habit.id, day)}
                        title={day}
                        className={"h-5 rounded-sm transition-all " +
                          (done ? "bg-amber-500 hover:bg-amber-400" : "bg-zinc-800 hover:bg-zinc-700") +
                          (isToday ? " ring-1 ring-white/20" : "")}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-zinc-700">6 weeks ago</span>
                  <span className="text-[9px] text-zinc-700">Today</span>
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
