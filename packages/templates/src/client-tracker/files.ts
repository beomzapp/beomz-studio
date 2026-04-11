import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Users, DollarSign, Briefcase, X, Search } from "lucide-react";

let nextId = 20;
const STATUSES = ["Active", "Completed", "On Hold", "Lead"];

const SAMPLE = [
  { id: 1, name: "Acme Corp", contact: "Sarah Chen", email: "sarah@acme.co", status: "Active", projects: 2, revenue: 8500 },
  { id: 2, name: "Pixel Studio", contact: "Alex Rivera", email: "alex@pixel.io", status: "Active", projects: 1, revenue: 3200 },
  { id: 3, name: "CloudNine", contact: "Jordan Lee", email: "jordan@cloud9.com", status: "Completed", projects: 3, revenue: 12000 },
  { id: 4, name: "StartupXYZ", contact: "Morgan Park", email: "morgan@xyz.co", status: "Lead", projects: 0, revenue: 0 },
  { id: 5, name: "DataFlow", contact: "Casey Kim", email: "casey@dataflow.io", status: "On Hold", projects: 1, revenue: 4500 },
];

export function App() {
  const [clients, setClients] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", email: "", status: "Lead" });
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter !== "All") list = list.filter((c) => c.status === statusFilter);
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.contact.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [clients, search, statusFilter]);

  const stats = useMemo(() => ({
    total: clients.length,
    active: clients.filter((c) => c.status === "Active").length,
    totalRevenue: clients.reduce((s, c) => s + c.revenue, 0),
    totalProjects: clients.reduce((s, c) => s + c.projects, 0),
  }), [clients]);

  const addClient = useCallback(() => {
    if (!form.name.trim()) return;
    setClients((prev) => [...prev, { id: nextId++, ...form, name: form.name.trim(), contact: form.contact.trim(), email: form.email.trim(), projects: 0, revenue: 0 }]);
    setForm({ name: "", contact: "", email: "", status: "Lead" });
    setAdding(false);
  }, [form]);

  const deleteClient = useCallback((id) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (selected === id) setSelected(null);
  }, [selected]);

  const updateStatus = useCallback((id, status) => {
    setClients((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  }, []);

  const fmt = (n) => "$" + n.toLocaleString();
  const statusColor = { Active: "bg-green-600/20 text-green-400", Completed: "bg-blue-600/20 text-blue-400", "On Hold": "bg-amber-600/20 text-amber-400", Lead: "bg-zinc-700 text-zinc-300" };
  const detail = clients.find((c) => c.id === selected);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Users size={20} /> Clients</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-white">{stats.total}</span>
            <p className="text-[10px] text-zinc-500">Clients</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-green-400">{stats.active}</span>
            <p className="text-[10px] text-zinc-500">Active</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-white">{stats.totalProjects}</span>
            <p className="text-[10px] text-zinc-500">Projects</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-cyan-400">{fmt(stats.totalRevenue)}</span>
            <p className="text-[10px] text-zinc-500">Revenue</p>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {["All", ...STATUSES].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={"rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all " + (statusFilter === s ? "bg-cyan-600 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              {s}
            </button>
          ))}
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Client</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <input placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <input placeholder="Contact person" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={addClient} className="w-full mt-3 rounded-xl bg-cyan-600 py-2.5 text-white text-sm font-medium hover:bg-cyan-500 transition-colors">Save Client</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">{detail.name}</h2>
                <p className="text-xs text-zinc-500">{detail.contact} · {detail.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => updateStatus(detail.id, s)} className={"rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all " + (detail.status === s ? statusColor[s] : "bg-zinc-800 text-zinc-600 hover:text-zinc-400")}>
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <Briefcase size={14} className="mx-auto text-zinc-500 mb-1" />
                <span className="text-lg font-bold text-white">{detail.projects}</span>
                <p className="text-[10px] text-zinc-500">Projects</p>
              </div>
              <div className="rounded-xl bg-zinc-800/60 p-3 text-center">
                <DollarSign size={14} className="mx-auto text-zinc-500 mb-1" />
                <span className="text-lg font-bold text-cyan-400">{fmt(detail.revenue)}</span>
                <p className="text-[10px] text-zinc-500">Revenue</p>
              </div>
            </div>
            <button onClick={() => deleteClient(detail.id)} className="text-xs text-red-400 hover:text-red-300">Delete client</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No clients found</p>}
            {filtered.map((c) => (
              <button key={c.id} onClick={() => { setSelected(c.id); setAdding(false); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-white">{c.name}</span>
                  <p className="text-xs text-zinc-500">{c.contact}</p>
                </div>
                <span className="text-xs text-cyan-400 font-medium">{fmt(c.revenue)}</span>
                <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + statusColor[c.status]}>{c.status}</span>
              </button>
            ))}
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
