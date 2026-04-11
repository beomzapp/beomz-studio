import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, ThumbsUp, MessageSquare, Search, X } from "lucide-react";

let nextId = 20;
const CATEGORIES = ["All", "Feature", "Integration", "UI/UX", "Performance", "API"];
const STATUS_CONFIG = { open: { label: "Open", color: "bg-blue-50 text-blue-600" }, planned: { label: "Planned", color: "bg-indigo-50 text-indigo-600" }, "in-progress": { label: "In Progress", color: "bg-amber-50 text-amber-600" }, shipped: { label: "Shipped", color: "bg-green-50 text-green-600" } };

const SAMPLE = [
  { id: 1, title: "Dark mode for the entire app", description: "A system-wide dark theme option", category: "UI/UX", status: "in-progress", votes: 342, comments: 28 },
  { id: 2, title: "Zapier integration", description: "Connect with 5000+ apps through Zapier", category: "Integration", status: "planned", votes: 218, comments: 15 },
  { id: 3, title: "Bulk actions in data tables", description: "Select multiple rows and perform batch operations", category: "Feature", status: "open", votes: 156, comments: 9 },
  { id: 4, title: "Faster search with autocomplete", description: "Real-time search suggestions as you type", category: "Performance", status: "open", votes: 134, comments: 7 },
  { id: 5, title: "GraphQL API endpoint", description: "Alternative to REST for more flexible queries", category: "API", status: "open", votes: 89, comments: 12 },
  { id: 6, title: "Custom email templates", description: "Design and customize transactional emails", category: "Feature", status: "shipped", votes: 267, comments: 31 },
];

export function App() {
  const [requests, setRequests] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [sort, setSort] = useState("votes");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "Feature" });
  const [voted, setVoted] = useState(new Set());

  const filtered = useMemo(() => {
    let list = requests;
    if (catFilter !== "All") list = list.filter((r) => r.category === catFilter);
    if (search) list = list.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => sort === "votes" ? (b.votes + (voted.has(b.id) ? 1 : 0)) - (a.votes + (voted.has(a.id) ? 1 : 0)) : b.comments - a.comments);
  }, [requests, search, catFilter, sort, voted]);

  const toggleVote = useCallback((id) => {
    setVoted((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const addRequest = useCallback(() => {
    if (!form.title.trim()) return;
    setRequests((prev) => [{ id: nextId++, title: form.title.trim(), description: form.description.trim(), category: form.category, status: "open", votes: 0, comments: 0 }, ...prev]);
    setForm({ title: "", description: "", category: "Feature" }); setAdding(false);
  }, [form]);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-[#111827] mb-2">Feature Requests</h1>
          <p className="text-sm text-[#6b7280]">Vote on features you want. We build what matters most.</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requests..." className="w-full rounded-lg bg-white border border-gray-200 py-2.5 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-indigo-300" />
          </div>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
            <Plus size={14} /> Submit
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5 overflow-x-auto">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCatFilter(c)} className={"rounded-full px-2.5 py-1 text-xs font-medium border transition-all whitespace-nowrap " + (catFilter === c ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-white text-[#6b7280] border-gray-200")}>
                {c}
              </button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg bg-white border border-gray-200 px-2 py-1.5 text-xs text-[#6b7280] outline-none">
            <option value="votes">Most Voted</option>
            <option value="comments">Most Discussed</option>
          </select>
        </div>

        {adding && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-[#111827]">Submit Feature Request</span>
              <button onClick={() => setAdding(false)} className="text-[#6b7280] hover:text-[#111827]"><X size={16} /></button>
            </div>
            <input placeholder="Feature title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 mb-2" />
            <textarea placeholder="Describe the feature..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 resize-none mb-2" />
            <div className="flex gap-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-[#111827] outline-none">
                {CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c}>{c}</option>)}
              </select>
              <button onClick={addRequest} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">Submit</button>
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {filtered.map((req) => {
            const v = voted.has(req.id);
            const cfg = STATUS_CONFIG[req.status];
            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
                <button onClick={() => toggleVote(req.id)} className={"flex flex-col items-center rounded-lg border px-3 py-2 transition-all " + (v ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "border-gray-200 text-[#6b7280] hover:border-indigo-200")}>
                  <ThumbsUp size={14} />
                  <span className="text-xs font-bold mt-0.5">{req.votes + (v ? 1 : 0)}</span>
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-[#111827]">{req.title}</h3>
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + cfg.color}>{cfg.label}</span>
                  </div>
                  {req.description && <p className="text-xs text-[#6b7280] mb-2">{req.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-[#6b7280]">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">{req.category}</span>
                    <span className="flex items-center gap-1"><MessageSquare size={10} />{req.comments}</span>
                  </div>
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
