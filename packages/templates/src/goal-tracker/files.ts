import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Target, Check, X, ChevronDown, ChevronRight } from "lucide-react";

let nextId = 10;
const SAMPLE = [
  { id: 1, title: "Launch MVP", progress: 65, milestones: [
    { id: 2, text: "Design wireframes", done: true },
    { id: 3, text: "Build frontend", done: true },
    { id: 4, text: "API integration", done: false },
    { id: 5, text: "User testing", done: false },
  ]},
  { id: 6, title: "Grow to 1000 users", progress: 30, milestones: [
    { id: 7, text: "Set up analytics", done: true },
    { id: 8, text: "Content marketing plan", done: false },
    { id: 9, text: "Launch referral program", done: false },
  ]},
];

export function App() {
  const [goals, setGoals] = useState(SAMPLE);
  const [expanded, setExpanded] = useState(new Set([1]));
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(null);
  const [newMilestone, setNewMilestone] = useState("");

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const addGoal = useCallback(() => {
    if (!newTitle.trim()) return;
    const id = nextId++;
    setGoals((prev) => [...prev, { id, title: newTitle.trim(), progress: 0, milestones: [] }]);
    setExpanded((prev) => new Set([...prev, id]));
    setNewTitle("");
    setAdding(false);
  }, [newTitle]);

  const deleteGoal = useCallback((id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const addMilestoneToGoal = useCallback((goalId) => {
    if (!newMilestone.trim()) return;
    setGoals((prev) => prev.map((g) => {
      if (g.id !== goalId) return g;
      return { ...g, milestones: [...g.milestones, { id: nextId++, text: newMilestone.trim(), done: false }] };
    }));
    setNewMilestone("");
    setAddingMilestone(null);
  }, [newMilestone]);

  const toggleMilestone = useCallback((goalId, msId) => {
    setGoals((prev) => prev.map((g) => {
      if (g.id !== goalId) return g;
      const milestones = g.milestones.map((m) => m.id === msId ? { ...m, done: !m.done } : m);
      const done = milestones.filter((m) => m.done).length;
      const progress = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : g.progress;
      return { ...g, milestones, progress };
    }));
  }, []);

  const deleteMilestone = useCallback((goalId, msId) => {
    setGoals((prev) => prev.map((g) => {
      if (g.id !== goalId) return g;
      const milestones = g.milestones.filter((m) => m.id !== msId);
      const done = milestones.filter((m) => m.done).length;
      const progress = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0;
      return { ...g, milestones, progress };
    }));
  }, []);

  const overall = useMemo(() => {
    if (goals.length === 0) return 0;
    return Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length);
  }, [goals]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Target size={20} /> Goals</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
            <Plus size={14} /> Add Goal
          </button>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Overall Progress</span>
            <span className="text-sm font-bold text-blue-400">{overall}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full">
            <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: overall + "%" }} />
          </div>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <form onSubmit={(e) => { e.preventDefault(); addGoal(); }} className="flex gap-2">
              <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Goal title..." className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white font-medium">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {goals.length === 0 && <p className="text-center text-sm text-zinc-600 py-8">No goals yet — add one above</p>}
          {goals.map((goal) => {
            const isOpen = expanded.has(goal.id);
            return (
              <div key={goal.id} className="rounded-2xl bg-zinc-900 border border-white/5 overflow-hidden">
                <div className="group flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpand(goal.id)}>
                  {isOpen ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white">{goal.title}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full">
                        <div className={"h-1.5 rounded-full transition-all " + (goal.progress === 100 ? "bg-green-500" : "bg-blue-500")} style={{ width: goal.progress + "%" }} />
                      </div>
                      <span className="text-xs text-zinc-500 w-8 text-right">{goal.progress}%</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteGoal(goal.id); }} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
                {isOpen && (
                  <div className="px-4 pb-3 pl-10 space-y-1.5">
                    {goal.milestones.map((ms) => (
                      <div key={ms.id} className="group flex items-center gap-2">
                        <button onClick={() => toggleMilestone(goal.id, ms.id)} className={"flex h-5 w-5 items-center justify-center rounded flex-shrink-0 transition-all " + (ms.done ? "bg-green-600 text-white" : "border border-zinc-700 hover:border-zinc-500")}>
                          {ms.done && <Check size={11} />}
                        </button>
                        <span className={"flex-1 text-sm " + (ms.done ? "text-zinc-600 line-through" : "text-zinc-300")}>{ms.text}</span>
                        <button onClick={() => deleteMilestone(goal.id, ms.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={12} /></button>
                      </div>
                    ))}
                    {addingMilestone === goal.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); addMilestoneToGoal(goal.id); }} className="flex gap-2 mt-1">
                        <input autoFocus value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} placeholder="Milestone..." className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none" />
                        <button type="submit" className="text-xs text-blue-400 hover:text-blue-300">Add</button>
                      </form>
                    ) : (
                      <button onClick={() => setAddingMilestone(goal.id)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 mt-1">
                        <Plus size={12} /> Add milestone
                      </button>
                    )}
                  </div>
                )}
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
