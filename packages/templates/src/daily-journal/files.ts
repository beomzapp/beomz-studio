import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Search, BookOpen, Calendar, PenLine } from "lucide-react";

let nextId = 10;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function App() {
  const [entries, setEntries] = useState([
    { id: 1, date: todayStr(), content: "Started working on the new project. Feeling excited about the direction we're heading. Need to focus on the core features first before adding polish.", wordCount: 24 },
    { id: 2, date: "2024-04-08", content: "Had a productive meeting about the roadmap. Key takeaway: simplicity wins. We decided to cut three features and ship faster.", wordCount: 22 },
    { id: 3, date: "2024-04-07", content: "Quiet Sunday. Read for two hours, went for a walk. Sometimes the best productivity is rest.", wordCount: 15 },
  ]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.content.toLowerCase().includes(q) || formatDate(e.date).toLowerCase().includes(q));
  }, [entries, search]);

  const selected = entries.find((e) => e.id === selectedId);

  const startNewEntry = useCallback(() => {
    const today = todayStr();
    const existing = entries.find((e) => e.date === today);
    if (existing) {
      setSelectedId(existing.id);
      setEditContent(existing.content);
      setEditing(true);
      return;
    }
    const id = nextId++;
    setEntries((prev) => [{ id, date: today, content: "", wordCount: 0 }, ...prev]);
    setSelectedId(id);
    setEditContent("");
    setEditing(true);
  }, [entries]);

  const saveEntry = useCallback(() => {
    if (!selectedId) return;
    const words = editContent.trim().split(/\\s+/).filter(Boolean).length;
    setEntries((prev) => prev.map((e) => e.id === selectedId ? { ...e, content: editContent, wordCount: words } : e));
    setEditing(false);
  }, [selectedId, editContent]);

  const deleteEntry = useCallback((id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (selectedId === id) { setSelectedId(null); setEditing(false); }
  }, [selectedId]);

  const totalWords = useMemo(() => entries.reduce((s, e) => s + e.wordCount, 0), [entries]);
  const streak = useMemo(() => {
    let count = 0;
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < sorted.length; i++) {
      const expected = new Date();
      expected.setDate(expected.getDate() - i);
      if (sorted[i]?.date === expected.toISOString().slice(0, 10)) count++;
      else break;
    }
    return count;
  }, [entries]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BookOpen size={20} /> Journal</h1>
          <button onClick={startNewEntry} className="flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors">
            <PenLine size={14} /> Write
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{entries.length}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Entries</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-amber-400">{streak}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Day Streak</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 text-center">
            <span className="text-2xl font-bold text-white">{totalWords.toLocaleString()}</span>
            <p className="text-[10px] text-zinc-500 mt-0.5">Words</p>
          </div>
        </div>

        {selected && editing ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 flex items-center gap-1"><Calendar size={11} /> {formatDate(selected.date)}</span>
              <span className="text-xs text-zinc-600">{editContent.trim().split(/\\s+/).filter(Boolean).length} words</span>
            </div>
            <textarea
              autoFocus
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="What's on your mind today?"
              rows={8}
              className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={saveEntry} className="rounded-xl bg-amber-700 px-4 py-2 text-sm text-white font-medium hover:bg-amber-600 transition-colors">Save</button>
              <button onClick={() => setEditing(false)} className="text-sm text-zinc-500 hover:text-zinc-300">Cancel</button>
            </div>
          </div>
        ) : selected ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 flex items-center gap-1"><Calendar size={11} /> {formatDate(selected.date)}</span>
              <div className="flex gap-2">
                <button onClick={() => { setEditContent(selected.content); setEditing(true); }} className="text-xs text-amber-400 hover:text-amber-300">Edit</button>
                <button onClick={() => setSelectedId(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Close</button>
              </div>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{selected.content || "Empty entry"}</p>
            <p className="text-xs text-zinc-600 mt-3">{selected.wordCount} words</p>
          </div>
        ) : null}

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="space-y-1.5">
          {filtered.map((entry) => (
            <button key={entry.id} onClick={() => { setSelectedId(entry.id); setEditing(false); }} className={"w-full text-left group rounded-xl border px-4 py-3 transition-all " + (selectedId === entry.id ? "bg-zinc-900 border-amber-500/30" : "bg-zinc-900 border-white/5 hover:border-white/10")}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-500">{formatDate(entry.date)}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
              <p className="text-sm text-zinc-300 line-clamp-2">{entry.content || "Empty entry"}</p>
              <span className="text-[10px] text-zinc-600 mt-1 block">{entry.wordCount} words</span>
            </button>
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
