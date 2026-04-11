import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, X, User, Clock, Tag, ChevronRight } from "lucide-react";

let nextId = 50;
const MEMBERS = ["SC", "AR", "JL", "MP"];
const MEMBER_COLORS = { SC: "bg-blue-100 text-blue-700", AR: "bg-green-100 text-green-700", JL: "bg-amber-100 text-amber-700", MP: "bg-pink-100 text-pink-700" };
const LABELS = ["Bug", "Feature", "Design", "Infra"];
const LABEL_COLORS = { Bug: "bg-red-50 text-red-600 border-red-200", Feature: "bg-green-50 text-green-600 border-green-200", Design: "bg-purple-50 text-purple-600 border-purple-200", Infra: "bg-blue-50 text-blue-600 border-blue-200" };

const COLUMNS = [
  { id: "backlog", title: "Backlog", wip: null },
  { id: "todo", title: "To Do", wip: 5 },
  { id: "in-progress", title: "In Progress", wip: 3 },
  { id: "review", title: "Review", wip: 2 },
  { id: "done", title: "Done", wip: null },
];

const SWIMLANES = ["Frontend", "Backend", "Design"];

const SAMPLE = [
  { id: 1, title: "Redesign settings page", col: "in-progress", lane: "Frontend", assignee: "SC", label: "Design", priority: "High" },
  { id: 2, title: "Fix auth token refresh", col: "in-progress", lane: "Backend", assignee: "AR", label: "Bug", priority: "Urgent" },
  { id: 3, title: "New user onboarding flow", col: "todo", lane: "Frontend", assignee: "JL", label: "Feature", priority: "High" },
  { id: 4, title: "API rate limiting", col: "todo", lane: "Backend", assignee: "AR", label: "Infra", priority: "Medium" },
  { id: 5, title: "Design system tokens", col: "review", lane: "Design", assignee: "MP", label: "Design", priority: "Medium" },
  { id: 6, title: "Database indexing", col: "backlog", lane: "Backend", assignee: "", label: "Infra", priority: "Low" },
  { id: 7, title: "Dark mode support", col: "backlog", lane: "Frontend", assignee: "", label: "Feature", priority: "Low" },
  { id: 8, title: "Icon library update", col: "done", lane: "Design", assignee: "MP", label: "Design", priority: "Low" },
  { id: 9, title: "Webhook retry logic", col: "todo", lane: "Backend", assignee: "JL", label: "Feature", priority: "Medium" },
  { id: 10, title: "Mobile responsive tables", col: "in-progress", lane: "Frontend", assignee: "SC", label: "Bug", priority: "High" },
];

export function App() {
  const [cards, setCards] = useState(SAMPLE);
  const [selected, setSelected] = useState(null);
  const [showLanes, setShowLanes] = useState(true);
  const [adding, setAdding] = useState(null);
  const [newTitle, setNewTitle] = useState("");

  const addCard = useCallback((col) => {
    if (!newTitle.trim()) return;
    setCards((prev) => [...prev, { id: nextId++, title: newTitle.trim(), col, lane: "Frontend", assignee: "", label: "Feature", priority: "Medium" }]);
    setNewTitle(""); setAdding(null);
  }, [newTitle]);

  const moveCard = useCallback((id, newCol) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, col: newCol } : c));
  }, []);

  const deleteCard = useCallback((id) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (selected === id) setSelected(null);
  }, [selected]);

  const detail = cards.find((c) => c.id === selected);
  const priorityColor = { Urgent: "bg-red-50 text-red-600", High: "bg-orange-50 text-orange-600", Medium: "bg-blue-50 text-blue-600", Low: "bg-gray-100 text-gray-500" };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#111827]">Kanban Pro</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLanes((s) => !s)} className={"rounded-lg px-3 py-1.5 text-xs font-medium border transition-all " + (showLanes ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-white text-[#6b7280] border-gray-200")}>
              Swimlanes
            </button>
            <div className="flex -space-x-1.5">
              {MEMBERS.map((m) => <div key={m} className={"flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold border-2 border-white " + (MEMBER_COLORS[m] || "bg-gray-100 text-gray-600")}>{m}</div>)}
            </div>
          </div>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#111827]">{detail.title}</h2>
              <button onClick={() => setSelected(null)} className="text-[#6b7280] hover:text-[#111827]"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-gray-50 p-3"><span className="text-[10px] text-[#6b7280] block">Status</span><span className="text-sm text-[#111827] font-medium">{COLUMNS.find((c) => c.id === detail.col)?.title}</span></div>
              <div className="rounded-lg bg-gray-50 p-3"><span className="text-[10px] text-[#6b7280] block">Priority</span><span className={"text-xs font-medium rounded-full px-2 py-0.5 " + (priorityColor[detail.priority] || "")}>{detail.priority}</span></div>
              <div className="rounded-lg bg-gray-50 p-3"><span className="text-[10px] text-[#6b7280] block">Swimlane</span><span className="text-sm text-[#111827]">{detail.lane}</span></div>
              <div className="rounded-lg bg-gray-50 p-3"><span className="text-[10px] text-[#6b7280] block">Assignee</span><span className="text-sm text-[#111827]">{detail.assignee || "Unassigned"}</span></div>
            </div>
            <div className="mb-4"><span className="text-[10px] text-[#6b7280] block mb-1">Label</span><span className={"rounded-full px-2 py-0.5 text-xs font-medium border " + (LABEL_COLORS[detail.label] || "")}>{detail.label}</span></div>
            <div className="flex gap-1 mb-4">
              <span className="text-xs text-[#6b7280]">Move to:</span>
              {COLUMNS.filter((c) => c.id !== detail.col).map((c) => (
                <button key={c.id} onClick={() => { moveCard(detail.id, c.id); setSelected(null); }} className="rounded px-2 py-0.5 text-[10px] text-[#6b7280] bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">{c.title}</button>
              ))}
            </div>
            <button onClick={() => deleteCard(detail.id)} className="text-xs text-red-500 hover:text-red-400">Delete card</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto p-4">
        <div className="flex gap-3 min-w-[900px]">
          {COLUMNS.map((col) => {
            const colCards = cards.filter((c) => c.col === col.id);
            const overWip = col.wip !== null && colCards.length > col.wip;
            const lanes = showLanes ? SWIMLANES : [null];

            return (
              <div key={col.id} className={"flex-1 min-w-[180px] rounded-xl p-3 " + (overWip ? "bg-red-50/50" : "bg-gray-50/80")}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[#111827]">{col.title}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={"text-[10px] font-medium " + (overWip ? "text-red-600" : "text-[#6b7280]")}>{colCards.length}{col.wip !== null ? "/" + col.wip : ""}</span>
                  </div>
                </div>

                {lanes.map((lane) => {
                  const laneCards = lane ? colCards.filter((c) => c.lane === lane) : colCards;
                  return (
                    <div key={lane || "all"}>
                      {lane && <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1.5 mt-2">{lane}</p>}
                      <div className="space-y-2">
                        {laneCards.map((card) => (
                          <button key={card.id} onClick={() => setSelected(card.id)} className="w-full text-left bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm hover:shadow transition-shadow">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              {card.label && <span className={"rounded-full px-1.5 py-0.5 text-[9px] font-medium border " + (LABEL_COLORS[card.label] || "")}>{card.label}</span>}
                              <span className={"rounded-full px-1.5 py-0.5 text-[9px] font-medium " + (priorityColor[card.priority] || "")}>{card.priority}</span>
                            </div>
                            <p className="text-xs font-medium text-[#111827] mb-1.5">{card.title}</p>
                            <div className="flex items-center justify-between">
                              {card.assignee ? <div className={"flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold " + (MEMBER_COLORS[card.assignee] || "bg-gray-100 text-gray-500")}>{card.assignee}</div> : <div />}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {adding === col.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); addCard(col.id); }} className="mt-2">
                    <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Card title..." className="w-full rounded-lg bg-white border border-gray-200 px-2.5 py-2 text-xs text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 mb-1" />
                    <div className="flex gap-1"><button type="submit" className="text-[10px] text-indigo-600 font-medium">Add</button><button type="button" onClick={() => setAdding(null)} className="text-[10px] text-[#6b7280]">Cancel</button></div>
                  </form>
                ) : (
                  <button onClick={() => setAdding(col.id)} className="flex items-center gap-1 text-[10px] text-[#6b7280] hover:text-indigo-600 w-full justify-center mt-2 py-1.5 rounded-lg hover:bg-white transition-colors">
                    <Plus size={11} /> Add
                  </button>
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
