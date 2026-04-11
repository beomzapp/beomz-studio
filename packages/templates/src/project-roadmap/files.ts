import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Flag, Check, ChevronDown, ChevronRight, X, Milestone } from "lucide-react";

let nextId = 30;
const PHASE_COLORS = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-amber-500", "bg-pink-500"];
const STATUS_OPTIONS = ["planned", "in-progress", "completed"];

const SAMPLE = [
  { id: 1, name: "Research & Discovery", color: 0, milestones: [
    { id: 2, text: "User interviews completed", status: "completed" },
    { id: 3, text: "Competitive analysis", status: "completed" },
    { id: 4, text: "Requirements document", status: "in-progress" },
  ]},
  { id: 5, name: "Design & Prototype", color: 1, milestones: [
    { id: 6, text: "Wireframes approved", status: "in-progress" },
    { id: 7, text: "High-fidelity mockups", status: "planned" },
    { id: 8, text: "Interactive prototype", status: "planned" },
  ]},
  { id: 9, name: "Development", color: 2, milestones: [
    { id: 10, text: "Core API built", status: "planned" },
    { id: 11, text: "Frontend MVP", status: "planned" },
    { id: 12, text: "Integration testing", status: "planned" },
  ]},
  { id: 13, name: "Launch", color: 3, milestones: [
    { id: 14, text: "Beta release", status: "planned" },
    { id: 15, text: "Public launch", status: "planned" },
  ]},
];

export function App() {
  const [phases, setPhases] = useState(SAMPLE);
  const [expanded, setExpanded] = useState(new Set([1, 5]));
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(null);
  const [newMilestone, setNewMilestone] = useState("");

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const addPhase = useCallback(() => {
    if (!newPhaseName.trim()) return;
    const id = nextId++;
    setPhases((prev) => [...prev, { id, name: newPhaseName.trim(), color: prev.length % PHASE_COLORS.length, milestones: [] }]);
    setExpanded((prev) => new Set([...prev, id]));
    setNewPhaseName(""); setAddingPhase(false);
  }, [newPhaseName]);

  const removePhase = useCallback((id) => { setPhases((prev) => prev.filter((p) => p.id !== id)); }, []);

  const addMilestoneHandler = useCallback((phaseId) => {
    if (!newMilestone.trim()) return;
    setPhases((prev) => prev.map((p) => p.id === phaseId ? { ...p, milestones: [...p.milestones, { id: nextId++, text: newMilestone.trim(), status: "planned" }] } : p));
    setNewMilestone(""); setAddingMilestone(null);
  }, [newMilestone]);

  const cycleStatus = useCallback((phaseId, msId) => {
    setPhases((prev) => prev.map((p) => p.id === phaseId ? {
      ...p, milestones: p.milestones.map((m) => m.id === msId ? { ...m, status: STATUS_OPTIONS[(STATUS_OPTIONS.indexOf(m.status) + 1) % STATUS_OPTIONS.length] } : m)
    } : p));
  }, []);

  const removeMilestone = useCallback((phaseId, msId) => {
    setPhases((prev) => prev.map((p) => p.id === phaseId ? { ...p, milestones: p.milestones.filter((m) => m.id !== msId) } : p));
  }, []);

  const overall = useMemo(() => {
    let total = 0, done = 0;
    for (const p of phases) for (const m of p.milestones) { total++; if (m.status === "completed") done++; }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [phases]);

  const statusIcon = (s) => s === "completed" ? "bg-green-600 text-white" : s === "in-progress" ? "bg-amber-600 text-white" : "border border-zinc-700";
  const statusLabel = { planned: "Planned", "in-progress": "In Progress", completed: "Done" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Flag size={20} /> Roadmap</h1>
          <button onClick={() => setAddingPhase(true)} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">
            <Plus size={14} /> Phase
          </button>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Overall Progress</span>
            <span className="text-sm font-bold text-purple-400">{overall}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full">
            <div className="h-2 bg-purple-500 rounded-full transition-all" style={{ width: overall + "%" }} />
          </div>
          <div className="flex gap-4 mt-3">
            {STATUS_OPTIONS.map((s) => {
              const count = phases.reduce((sum, p) => sum + p.milestones.filter((m) => m.status === s).length, 0);
              return <span key={s} className="text-[10px] text-zinc-500">{statusLabel[s]}: {count}</span>;
            })}
          </div>
        </div>

        {addingPhase && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <form onSubmit={(e) => { e.preventDefault(); addPhase(); }} className="flex gap-2">
              <input autoFocus value={newPhaseName} onChange={(e) => setNewPhaseName(e.target.value)} placeholder="Phase name..." className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-purple-600 px-4 py-2 text-sm text-white font-medium">Add</button>
              <button type="button" onClick={() => setAddingPhase(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {phases.map((phase, pi) => {
            const isOpen = expanded.has(phase.id);
            const done = phase.milestones.filter((m) => m.status === "completed").length;
            const pct = phase.milestones.length > 0 ? Math.round((done / phase.milestones.length) * 100) : 0;
            return (
              <div key={phase.id} className="rounded-2xl bg-zinc-900 border border-white/5 overflow-hidden">
                <div className="group flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpand(phase.id)}>
                  {isOpen ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                  <div className={"h-3 w-3 rounded-full flex-shrink-0 " + PHASE_COLORS[phase.color]} />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-white">{phase.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-zinc-800 rounded-full">
                        <div className={"h-1 rounded-full transition-all " + PHASE_COLORS[phase.color]} style={{ width: pct + "%" }} />
                      </div>
                      <span className="text-[10px] text-zinc-500">{done}/{phase.milestones.length}</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removePhase(phase.id); }} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
                {isOpen && (
                  <div className="px-4 pb-3 pl-11 space-y-1.5">
                    {phase.milestones.map((ms) => (
                      <div key={ms.id} className="group flex items-center gap-2">
                        <button onClick={() => cycleStatus(phase.id, ms.id)} className={"flex h-5 w-5 items-center justify-center rounded flex-shrink-0 transition-all " + statusIcon(ms.status)}>
                          {ms.status === "completed" && <Check size={11} />}
                          {ms.status === "in-progress" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </button>
                        <span className={"flex-1 text-sm " + (ms.status === "completed" ? "text-zinc-600 line-through" : "text-zinc-300")}>{ms.text}</span>
                        <span className={"text-[10px] " + (ms.status === "completed" ? "text-green-500" : ms.status === "in-progress" ? "text-amber-500" : "text-zinc-600")}>{statusLabel[ms.status]}</span>
                        <button onClick={() => removeMilestone(phase.id, ms.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={12} /></button>
                      </div>
                    ))}
                    {addingMilestone === phase.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); addMilestoneHandler(phase.id); }} className="flex gap-2">
                        <input autoFocus value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} placeholder="Milestone..." className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none" />
                        <button type="submit" className="text-xs text-purple-400">Add</button>
                      </form>
                    ) : (
                      <button onClick={() => setAddingMilestone(phase.id)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400"><Plus size={12} /> Add milestone</button>
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
