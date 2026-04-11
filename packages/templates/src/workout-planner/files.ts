import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, Trash2, Dumbbell, X } from "lucide-react";

let nextId = 30;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MUSCLES = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Cardio", "Full Body"];
const EXERCISES = {
  Chest: ["Bench Press", "Incline Press", "Push-ups", "Chest Fly", "Dips"],
  Back: ["Pull-ups", "Barbell Row", "Lat Pulldown", "Deadlift", "Cable Row"],
  Shoulders: ["Overhead Press", "Lateral Raise", "Front Raise", "Face Pull", "Arnold Press"],
  Arms: ["Bicep Curl", "Tricep Extension", "Hammer Curl", "Skull Crushers", "Preacher Curl"],
  Legs: ["Squat", "Leg Press", "Lunges", "Leg Curl", "Calf Raise"],
  Core: ["Plank", "Crunches", "Russian Twist", "Leg Raise", "Ab Wheel"],
  Cardio: ["Running", "Cycling", "Jump Rope", "Rowing", "Swimming"],
  "Full Body": ["Burpees", "Clean & Press", "Thrusters", "Kettlebell Swing", "Box Jumps"],
};

const SAMPLE = {
  Monday: [{ id: 1, exercise: "Bench Press", sets: 4, reps: "8-10", muscle: "Chest" }, { id: 2, exercise: "Incline Press", sets: 3, reps: "10-12", muscle: "Chest" }, { id: 3, exercise: "Tricep Extension", sets: 3, reps: "12", muscle: "Arms" }],
  Wednesday: [{ id: 4, exercise: "Pull-ups", sets: 4, reps: "6-8", muscle: "Back" }, { id: 5, exercise: "Barbell Row", sets: 4, reps: "8-10", muscle: "Back" }, { id: 6, exercise: "Bicep Curl", sets: 3, reps: "12", muscle: "Arms" }],
  Friday: [{ id: 7, exercise: "Squat", sets: 4, reps: "8-10", muscle: "Legs" }, { id: 8, exercise: "Leg Press", sets: 3, reps: "10-12", muscle: "Legs" }, { id: 9, exercise: "Plank", sets: 3, reps: "60s", muscle: "Core" }],
};

export function App() {
  const [plan, setPlan] = useState(SAMPLE);
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [addingTo, setAddingTo] = useState(null);
  const [muscle, setMuscle] = useState("Chest");
  const [exercise, setExercise] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");

  const dayExercises = plan[selectedDay] || [];

  const addExercise = useCallback(() => {
    if (!exercise || !addingTo) return;
    setPlan((prev) => ({
      ...prev,
      [addingTo]: [...(prev[addingTo] || []), { id: nextId++, exercise, sets: parseInt(sets) || 3, reps, muscle }],
    }));
    setExercise(""); setAddingTo(null);
  }, [addingTo, exercise, sets, reps, muscle]);

  const removeExercise = useCallback((day, id) => {
    setPlan((prev) => ({ ...prev, [day]: (prev[day] || []).filter((e) => e.id !== id) }));
  }, []);

  const muscleColor = { Chest: "bg-red-500", Back: "bg-blue-500", Shoulders: "bg-amber-500", Arms: "bg-purple-500", Legs: "bg-green-500", Core: "bg-pink-500", Cardio: "bg-cyan-500", "Full Body": "bg-orange-500" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Dumbbell size={20} /> Workout Planner</h1>

        <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
          {DAYS.map((d) => {
            const count = (plan[d] || []).length;
            return (
              <button key={d} onClick={() => setSelectedDay(d)} className={"rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all " + (selectedDay === d ? "bg-red-600 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
                {d.slice(0, 3)}{count > 0 ? " (" + count + ")" : ""}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white">{selectedDay}</h2>
            <button onClick={() => setAddingTo(selectedDay)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"><Plus size={13} /> Add</button>
          </div>

          {dayExercises.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-6">Rest day — no exercises planned</p>
          )}

          <div className="space-y-2">
            {dayExercises.map((ex) => (
              <div key={ex.id} className="group flex items-center gap-3 rounded-xl bg-zinc-800/60 px-3 py-2.5">
                <div className={"h-2 w-2 rounded-full flex-shrink-0 " + (muscleColor[ex.muscle] || "bg-zinc-500")} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{ex.exercise}</span>
                  <span className="block text-xs text-zinc-500">{ex.muscle}</span>
                </div>
                <span className="text-xs text-zinc-400">{ex.sets} x {ex.reps}</span>
                <button onClick={() => removeExercise(selectedDay, ex.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        {addingTo && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-white">Add to {addingTo}</span>
              <button onClick={() => setAddingTo(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <select value={muscle} onChange={(e) => { setMuscle(e.target.value); setExercise(""); }} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none mb-2">
              {MUSCLES.map((m) => <option key={m}>{m}</option>)}
            </select>
            <select value={exercise} onChange={(e) => setExercise(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none mb-2">
              <option value="">Select exercise...</option>
              {(EXERCISES[muscle] || []).map((ex) => <option key={ex} value={ex}>{ex}</option>)}
            </select>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 mb-1 block">Sets</label>
                <input value={sets} onChange={(e) => setSets(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none text-center" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-500 mb-1 block">Reps</label>
                <input value={reps} onChange={(e) => setReps(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none text-center" />
              </div>
            </div>
            <button onClick={addExercise} disabled={!exercise} className="w-full rounded-xl bg-red-600 py-2.5 text-white text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-40">Add Exercise</button>
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
