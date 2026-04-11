import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Search, Bug, X, AlertTriangle, AlertCircle, Info } from "lucide-react";

let nextId = 20;
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

const SAMPLE = [
  { id: 1, title: "Login page crashes on mobile Safari", priority: "Critical", status: "Open", assignee: "Sarah", created: "Apr 8", description: "Users on iOS 17 can't complete login." },
  { id: 2, title: "Dashboard chart not rendering", priority: "High", status: "In Progress", assignee: "Alex", created: "Apr 7", description: "Bar chart shows blank after API update." },
  { id: 3, title: "Email notifications delayed", priority: "Medium", status: "Open", assignee: "", created: "Apr 6", description: "Emails arrive 30+ minutes late." },
  { id: 4, title: "Typo on pricing page", priority: "Low", status: "Resolved", assignee: "Jordan", created: "Apr 5", description: "\"Unlimted\" should be \"Unlimited\"." },
  { id: 5, title: "CSV export missing headers", priority: "High", status: "Open", assignee: "Morgan", created: "Apr 9", description: "Exported CSV files have no column headers." },
];

export function App() {
  const [bugs, setBugs] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", priority: "Medium", assignee: "", description: "" });
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    let list = bugs;
    if (priorityFilter !== "All") list = list.filter((b) => b.priority === priorityFilter);
    if (statusFilter !== "All") list = list.filter((b) => b.status === statusFilter);
    if (search) list = list.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [bugs, search, priorityFilter, statusFilter]);

  const addBug = useCallback(() => {
    if (!form.title.trim()) return;
    setBugs((prev) => [{ id: nextId++, ...form, title: form.title.trim(), description: form.description.trim(), assignee: form.assignee.trim(), status: "Open", created: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) }, ...prev]);
    setForm({ title: "", priority: "Medium", assignee: "", description: "" }); setAdding(false);
  }, [form]);

  const deleteBug = useCallback((id) => { setBugs((prev) => prev.filter((b) => b.id !== id)); if (selected === id) setSelected(null); }, [selected]);
  const updateStatus = useCallback((id, status) => { setBugs((prev) => prev.map((b) => b.id === id ? { ...b, status } : b)); }, []);

  const counts = useMemo(() => ({ open: bugs.filter((b) => b.status === "Open").length, inProgress: bugs.filter((b) => b.status === "In Progress").length, resolved: bugs.filter((b) => b.status === "Resolved").length }), [bugs]);

  const priorityColor = { Critical: "bg-red-600 text-white", High: "bg-orange-600/20 text-orange-400", Medium: "bg-amber-600/20 text-amber-400", Low: "bg-zinc-700 text-zinc-300" };
  const statusColor = { Open: "bg-red-600/20 text-red-400", "In Progress": "bg-blue-600/20 text-blue-400", Resolved: "bg-green-600/20 text-green-400", Closed: "bg-zinc-700 text-zinc-400" };
  const priorityIcon = { Critical: AlertTriangle, High: AlertCircle, Medium: Info, Low: Info };
  const detail = bugs.find((b) => b.id === selected);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Bug size={20} className="text-red-400" /> Bug Tracker</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors">
            <Plus size={14} /> Report Bug
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-red-400">{counts.open}</span>
            <p className="text-[10px] text-zinc-500">Open</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-blue-400">{counts.inProgress}</span>
            <p className="text-[10px] text-zinc-500">In Progress</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-green-400">{counts.resolved}</span>
            <p className="text-[10px] text-zinc-500">Resolved</p>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bugs..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-2 mb-4">
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="rounded-lg bg-zinc-900 border border-white/5 px-3 py-1.5 text-xs text-white outline-none">
            <option value="All">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg bg-zinc-900 border border-white/5 px-3 py-1.5 text-xs text-white outline-none">
            <option value="All">All Statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <span className="text-xs text-zinc-500 self-center ml-auto">{filtered.length} bugs</span>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Report Bug</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Bug title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none mb-2" />
            <div className="flex gap-2 mb-3">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <input placeholder="Assignee" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <button onClick={addBug} className="w-full rounded-xl bg-red-600 py-2.5 text-white text-sm font-medium hover:bg-red-500 transition-colors">Submit Bug</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">{detail.title}</h2>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + priorityColor[detail.priority]}>{detail.priority}</span>
              <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + statusColor[detail.status]}>{detail.status}</span>
              {detail.assignee && <span className="text-xs text-zinc-500">Assigned: {detail.assignee}</span>}
              <span className="text-xs text-zinc-600 ml-auto">{detail.created}</span>
            </div>
            {detail.description && <p className="text-sm text-zinc-400 mb-4">{detail.description}</p>}
            <div className="flex gap-1 mb-3">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => updateStatus(detail.id, s)} className={"rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all " + (detail.status === s ? statusColor[s] : "bg-zinc-800 text-zinc-600 hover:text-zinc-400")}>{s}</button>
              ))}
            </div>
            <button onClick={() => deleteBug(detail.id)} className="text-xs text-red-400 hover:text-red-300">Delete bug</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No bugs found</p>}
            {filtered.map((b) => {
              const PIcon = priorityIcon[b.priority] || Info;
              return (
                <button key={b.id} onClick={() => { setSelected(b.id); setAdding(false); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors">
                  <PIcon size={14} className={b.priority === "Critical" ? "text-red-400" : b.priority === "High" ? "text-orange-400" : "text-zinc-500"} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white">{b.title}</span>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                      {b.assignee && <span>{b.assignee}</span>}
                      <span>{b.created}</span>
                    </div>
                  </div>
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + statusColor[b.status]}>{b.status}</span>
                </button>
              );
            })}
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
