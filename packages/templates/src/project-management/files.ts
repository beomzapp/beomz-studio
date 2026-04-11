import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Check, Circle, Clock, Users, X, LayoutGrid } from "lucide-react";

let nextId = 30;
const MEMBERS = ["Sarah C.", "Alex R.", "Jordan L.", "Morgan P."];
const STATUSES = ["To Do", "In Progress", "Review", "Done"];
const STATUS_COLOR = { "To Do": "bg-gray-100 text-gray-600", "In Progress": "bg-blue-50 text-blue-600", Review: "bg-amber-50 text-amber-600", Done: "bg-green-50 text-green-600" };

const SAMPLE = [
  { id: 1, title: "Design user dashboard", assignee: "Sarah C.", status: "In Progress", priority: "High", due: "Apr 12" },
  { id: 2, title: "Implement auth API", assignee: "Alex R.", status: "In Progress", priority: "High", due: "Apr 11" },
  { id: 3, title: "Write test cases", assignee: "Jordan L.", status: "To Do", priority: "Medium", due: "Apr 14" },
  { id: 4, title: "Set up CI/CD pipeline", assignee: "Alex R.", status: "Done", priority: "High", due: "Apr 9" },
  { id: 5, title: "Create onboarding docs", assignee: "Morgan P.", status: "Review", priority: "Low", due: "Apr 13" },
  { id: 6, title: "Fix mobile layout bugs", assignee: "Sarah C.", status: "To Do", priority: "Medium", due: "Apr 15" },
  { id: 7, title: "Database migration script", assignee: "Jordan L.", status: "Done", priority: "High", due: "Apr 8" },
];

export function App() {
  const [tasks, setTasks] = useState(SAMPLE);
  const [view, setView] = useState("board");
  const [adding, setAdding] = useState(null);
  const [newTitle, setNewTitle] = useState("");

  const addTask = useCallback((status) => {
    if (!newTitle.trim()) return;
    setTasks((prev) => [...prev, { id: nextId++, title: newTitle.trim(), assignee: MEMBERS[0], status, priority: "Medium", due: "" }]);
    setNewTitle(""); setAdding(null);
  }, [newTitle]);

  const moveTask = useCallback((id, newStatus) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));
  }, []);

  const deleteTask = useCallback((id) => { setTasks((prev) => prev.filter((t) => t.id !== id)); }, []);

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((t) => t.status === "Done").length,
    pct: tasks.length > 0 ? Math.round((tasks.filter((t) => t.status === "Done").length / tasks.length) * 100) : 0,
  }), [tasks]);

  const priorityColor = { High: "bg-red-50 text-red-600", Medium: "bg-amber-50 text-amber-600", Low: "bg-gray-100 text-gray-500" };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-lg font-semibold text-[#111827]">Project: Beomz V2</h1>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-xs text-[#6b7280]">{stats.done}/{stats.total} tasks done</span>
              <div className="w-24 h-1.5 bg-gray-200 rounded-full"><div className="h-1.5 bg-indigo-500 rounded-full" style={{ width: stats.pct + "%" }} /></div>
              <span className="text-xs font-medium text-indigo-600">{stats.pct}%</span>
            </div>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {["board", "list"].map((v) => (
              <button key={v} onClick={() => setView(v)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (view === v ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {view === "board" ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {STATUSES.map((status) => {
              const col = tasks.filter((t) => t.status === status);
              return (
                <div key={status} className="bg-gray-50/50 rounded-xl p-3 min-h-[200px]">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + STATUS_COLOR[status]}>{status}</span>
                    <span className="text-xs text-[#6b7280]">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((task) => (
                      <div key={task.id} className="group bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow transition-shadow">
                        <p className="text-sm text-[#111827] font-medium mb-2">{task.title}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-medium " + priorityColor[task.priority]}>{task.priority}</span>
                            {task.due && <span className="text-[10px] text-[#6b7280] flex items-center gap-0.5"><Clock size={9} />{task.due}</span>}
                          </div>
                          <span className="text-[10px] text-[#6b7280]">{task.assignee}</span>
                        </div>
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={() => moveTask(task.id, s)} className="text-[9px] text-[#6b7280] hover:text-indigo-600 bg-gray-50 rounded px-1.5 py-0.5">{s}</button>
                          ))}
                          <button onClick={() => deleteTask(task.id)} className="text-[9px] text-[#6b7280] hover:text-red-500 bg-gray-50 rounded px-1.5 py-0.5 ml-auto">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {adding === status ? (
                    <form onSubmit={(e) => { e.preventDefault(); addTask(status); }} className="mt-2">
                      <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title..." className="w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 mb-1" />
                      <div className="flex gap-1">
                        <button type="submit" className="text-xs text-indigo-600 font-medium">Add</button>
                        <button type="button" onClick={() => setAdding(null)} className="text-xs text-[#6b7280]">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <button onClick={() => setAdding(status)} className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-indigo-600 w-full justify-center mt-2 py-2 rounded-lg hover:bg-white transition-colors">
                      <Plus size={13} /> Add task
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Task</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Priority</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Assignee</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Due</th>
              </tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-[#111827] font-medium">{t.title}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + STATUS_COLOR[t.status]}>{t.status}</span></td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + priorityColor[t.priority]}>{t.priority}</span></td>
                    <td className="px-4 py-3 text-[#6b7280]">{t.assignee}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{t.due || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
