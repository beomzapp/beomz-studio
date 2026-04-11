import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, X, Check, Flame } from "lucide-react";

let nextId = 1;
const todayStr = () => new Date().toISOString().slice(0, 10);

export function App() {
  const [habits, setHabits] = useState([
    { id: nextId++, name: "Exercise", log: {} },
    { id: nextId++, name: "Read 30 min", log: {} },
    { id: nextId++, name: "Drink 8 glasses", log: {} },
  ]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const today = todayStr();

  const addHabit = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setHabits((prev) => [...prev, { id: nextId++, name: trimmed, log: {} }]);
    setNewName("");
    setAdding(false);
  }, [newName]);

  const removeHabit = useCallback((id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const toggleDay = useCallback((id, day) => {
    setHabits((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      const next = { ...h.log };
      if (next[day]) delete next[day]; else next[day] = true;
      return { ...h, log: next };
    }));
  }, []);

  const last30 = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    return days;
  }, []);

  const getStreak = useCallback((habit) => {
    let streak = 0;
    for (let i = 0; ; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (habit.log[key]) streak++;
      else break;
    }
    return streak;
  }, []);

  const heatmapData = useMemo(() => {
    return last30.map((day) => {
      const count = habits.filter((h) => h.log[day]).length;
      return { day, count };
    });
  }, [last30, habits]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white">Habit Tracker</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <form onSubmit={(e) => { e.preventDefault(); addHabit(); }} className="flex gap-2">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New habit..." className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-green-600 px-4 py-2 text-sm text-white font-medium">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </form>
          </div>
        )}

        <div className="space-y-2 mb-6">
          {habits.map((habit) => {
            const done = !!habit.log[today];
            const streak = getStreak(habit);
            return (
              <div key={habit.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
                <button onClick={() => toggleDay(habit.id, today)} className={"flex h-7 w-7 items-center justify-center rounded-lg transition-all flex-shrink-0 " + (done ? "bg-green-600 text-white" : "bg-zinc-800 text-zinc-600 hover:bg-zinc-700")}>
                  {done && <Check size={14} />}
                </button>
                <span className={"flex-1 text-sm " + (done ? "text-zinc-400 line-through" : "text-white")}>{habit.name}</span>
                {streak > 0 && (
                  <span className="flex items-center gap-1 text-xs text-orange-400">
                    <Flame size={12} /> {streak}d
                  </span>
                )}
                <button onClick={() => removeHabit(habit.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {habits.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No habits yet — add one above</p>}
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
          <h2 className="text-xs font-medium text-zinc-400 mb-3">Last 30 Days</h2>
          <div className="grid grid-cols-10 gap-1">
            {heatmapData.map(({ day, count }) => {
              const intensity = habits.length > 0 ? count / habits.length : 0;
              const bg = intensity === 0 ? "bg-zinc-800" : intensity <= 0.33 ? "bg-green-900" : intensity <= 0.66 ? "bg-green-700" : "bg-green-500";
              const isToday = day === today;
              return (
                <div
                  key={day}
                  title={day + ": " + count + "/" + habits.length}
                  className={"h-4 rounded-sm transition-colors " + bg + (isToday ? " ring-1 ring-white/20" : "")}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-zinc-600">30 days ago</span>
            <span className="text-[10px] text-zinc-600">Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
