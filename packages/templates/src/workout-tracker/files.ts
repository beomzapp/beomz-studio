import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Dumbbell, Calendar } from "lucide-react";

let nextId = 1;

export function App() {
  const [exercises, setExercises] = useState([]);
  const [name, setName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("");
  const [view, setView] = useState("log");

  const addExercise = useCallback(() => {
    if (!name.trim()) return;
    setExercises((prev) => [
      {
        id: nextId++,
        name: name.trim(),
        sets: parseInt(sets) || 0,
        reps: parseInt(reps) || 0,
        weight: parseFloat(weight) || 0,
        date: new Date().toLocaleDateString(),
        timestamp: Date.now(),
      },
      ...prev,
    ]);
    setName("");
    setWeight("");
  }, [name, sets, reps, weight]);

  const deleteExercise = useCallback((id) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toLocaleDateString();
    const todayExercises = exercises.filter((e) => e.date === today);
    const totalVolume = todayExercises.reduce((sum, e) => sum + e.sets * e.reps * e.weight, 0);
    const uniqueDays = new Set(exercises.map((e) => e.date)).size;
    return { todayCount: todayExercises.length, totalVolume, uniqueDays, total: exercises.length };
  }, [exercises]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white">Workout Tracker</h1>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {[{ k: "log", icon: Dumbbell }, { k: "history", icon: Calendar }].map(({ k, icon: Icon }) => (
              <button key={k} onClick={() => setView(k)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (view === k ? "bg-zinc-800 text-white" : "text-zinc-500")}>
                <Icon size={13} className="inline mr-1" />{k}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-teal-400">{stats.todayCount}</span>
            <p className="text-[10px] text-zinc-500 mt-1">Today</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{stats.totalVolume.toLocaleString()}</span>
            <p className="text-[10px] text-zinc-500 mt-1">Volume (lbs)</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{stats.uniqueDays}</span>
            <p className="text-[10px] text-zinc-500 mt-1">Days Active</p>
          </div>
        </div>

        {view === "log" && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Log Exercise</h2>
            <input
              type="text"
              placeholder="Exercise name (e.g. Bench Press)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none mb-3"
            />
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Sets</label>
                <input type="number" value={sets} onChange={(e) => setSets(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-white text-sm outline-none text-center" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Reps</label>
                <input type="number" value={reps} onChange={(e) => setReps(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-white text-sm outline-none text-center" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Weight (lbs)</label>
                <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-white text-sm outline-none text-center placeholder-zinc-600" />
              </div>
            </div>
            <button onClick={addExercise} className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2.5 text-white text-sm font-medium hover:bg-teal-500 transition-colors">
              <Plus size={15} /> Log Exercise
            </button>
          </div>
        )}

        <div className="space-y-2">
          {exercises.length === 0 && (
            <p className="text-center text-sm text-zinc-600 py-8">No exercises logged yet</p>
          )}
          {exercises.map((ex) => (
            <div key={ex.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3">
              <Dumbbell size={16} className="text-teal-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{ex.name}</span>
                <div className="flex gap-2 text-xs text-zinc-500 mt-0.5">
                  <span>{ex.sets}×{ex.reps}</span>
                  {ex.weight > 0 && <span>@ {ex.weight} lbs</span>}
                  <span className="text-zinc-700">·</span>
                  <span>{ex.date}</span>
                </div>
              </div>
              <button onClick={() => deleteExercise(ex.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                <Trash2 size={14} />
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
