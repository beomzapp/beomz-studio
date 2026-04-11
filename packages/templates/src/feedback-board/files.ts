import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, ThumbsUp, MessageSquare, Search, X, Send } from "lucide-react";

let nextId = 30;
const CATEGORIES = ["All", "Bug", "Feature", "UX", "Content", "Other"];
const CAT_COLOR = { Bug: "bg-red-50 text-red-600", Feature: "bg-green-50 text-green-600", UX: "bg-purple-50 text-purple-600", Content: "bg-blue-50 text-blue-600", Other: "bg-gray-100 text-gray-600" };

const SAMPLE = [
  { id: 1, title: "Search results are too slow", body: "Takes 3+ seconds on large datasets", category: "Bug", votes: 24, response: "We've optimized the search query — should be much faster now.", comments: 5 },
  { id: 2, title: "Add keyboard shortcuts", body: "Would love vim-style navigation", category: "Feature", votes: 18, response: "", comments: 3 },
  { id: 3, title: "Confusing onboarding steps", body: "Step 3 doesn't explain what to do next", category: "UX", votes: 31, response: "Thanks for the feedback! We've redesigned the onboarding flow in v2.4.", comments: 8 },
  { id: 4, title: "Documentation needs more examples", body: "API docs lack practical code samples", category: "Content", votes: 15, response: "", comments: 2 },
  { id: 5, title: "Mobile layout breaks on small screens", body: "Sidebar overlaps content on iPhone SE", category: "Bug", votes: 42, response: "Fixed in the latest release. Thanks for reporting!", comments: 6 },
];

export function App() {
  const [items, setItems] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "Feature" });
  const [selected, setSelected] = useState(null);
  const [voted, setVoted] = useState(new Set());

  const filtered = useMemo(() => {
    let list = items;
    if (catFilter !== "All") list = list.filter((i) => i.category === catFilter);
    if (search) list = list.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => (b.votes + (voted.has(b.id) ? 1 : 0)) - (a.votes + (voted.has(a.id) ? 1 : 0)));
  }, [items, search, catFilter, voted]);

  const toggleVote = useCallback((id) => {
    setVoted((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const addItem = useCallback(() => {
    if (!form.title.trim()) return;
    setItems((prev) => [{ id: nextId++, title: form.title.trim(), body: form.body.trim(), category: form.category, votes: 0, response: "", comments: 0 }, ...prev]);
    setForm({ title: "", body: "", category: "Feature" }); setAdding(false);
  }, [form]);

  const detail = items.find((i) => i.id === selected);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-[#111827] mb-2">Feedback Board</h1>
          <p className="text-sm text-[#6b7280]">Share your thoughts and help us improve</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search feedback..." className="w-full rounded-lg bg-white border border-gray-200 py-2.5 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-indigo-300" />
          </div>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
            <Plus size={14} /> Submit
          </button>
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCatFilter(c)} className={"rounded-full px-2.5 py-1 text-xs font-medium border transition-all whitespace-nowrap " + (catFilter === c ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-white text-[#6b7280] border-gray-200")}>
              {c}
            </button>
          ))}
        </div>

        {adding && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-[#111827]">Submit Feedback</span>
              <button onClick={() => setAdding(false)} className="text-[#6b7280] hover:text-[#111827]"><X size={16} /></button>
            </div>
            <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 mb-2" />
            <textarea placeholder="Details..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 resize-none mb-2" />
            <div className="flex gap-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-[#111827] outline-none">
                {CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c}>{c}</option>)}
              </select>
              <button onClick={addItem} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"><Send size={14} /></button>
            </div>
          </div>
        )}

        {detail ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + (CAT_COLOR[detail.category] || "")}>{detail.category}</span>
                <h2 className="text-sm font-semibold text-[#111827]">{detail.title}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#6b7280] hover:text-[#111827]"><X size={16} /></button>
            </div>
            {detail.body && <p className="text-sm text-[#374151] mb-4">{detail.body}</p>}
            <div className="flex items-center gap-3 mb-4 text-xs text-[#6b7280]">
              <span className="flex items-center gap-1"><ThumbsUp size={12} /> {detail.votes + (voted.has(detail.id) ? 1 : 0)} votes</span>
              <span className="flex items-center gap-1"><MessageSquare size={12} /> {detail.comments} comments</span>
            </div>
            {detail.response && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4">
                <p className="text-xs font-medium text-indigo-600 mb-1">Team Response</p>
                <p className="text-sm text-[#374151]">{detail.response}</p>
              </div>
            )}
            {!detail.response && <p className="text-sm text-[#6b7280] text-center py-4 bg-gray-50 rounded-lg">No response yet — the team will review this soon</p>}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.length === 0 && <p className="text-center text-sm text-[#6b7280] py-8">No feedback found</p>}
            {filtered.map((item) => {
              const v = voted.has(item.id);
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => { setSelected(item.id); setAdding(false); }}>
                  <button onClick={(e) => { e.stopPropagation(); toggleVote(item.id); }} className={"flex flex-col items-center rounded-lg border px-2.5 py-2 transition-all " + (v ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "border-gray-200 text-[#6b7280] hover:border-indigo-200")}>
                    <ThumbsUp size={13} />
                    <span className="text-[10px] font-bold mt-0.5">{item.votes + (v ? 1 : 0)}</span>
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + (CAT_COLOR[item.category] || "")}>{item.category}</span>
                      {item.response && <span className="text-[10px] text-indigo-600 font-medium">Responded</span>}
                    </div>
                    <h3 className="text-sm font-medium text-[#111827]">{item.title}</h3>
                    {item.body && <p className="text-xs text-[#6b7280] mt-0.5 truncate">{item.body}</p>}
                    <span className="text-[10px] text-[#6b7280] mt-1 flex items-center gap-1"><MessageSquare size={9} /> {item.comments}</span>
                  </div>
                </div>
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
