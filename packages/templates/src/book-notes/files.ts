import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, BookOpen, Search, Star, X, PenLine, Lightbulb } from "lucide-react";

let nextId = 20;

const SAMPLE = [
  { id: 1, title: "Atomic Habits", author: "James Clear", rating: 5, highlights: [
    "You do not rise to the level of your goals. You fall to the level of your systems.",
    "Every action you take is a vote for the type of person you wish to become.",
    "The most effective way to change your habits is to focus not on what you want to achieve, but on who you wish to become.",
  ], reflection: "This book completely changed how I think about building routines. The key insight: identity-based habits beat outcome-based goals.", tags: ["habits", "productivity", "psychology"] },
  { id: 2, title: "The Lean Startup", author: "Eric Ries", rating: 4, highlights: [
    "The only way to win is to learn faster than anyone else.",
    "If we do not know who the customer is, we do not know what quality is.",
  ], reflection: "Great framework for validating ideas fast. Build-Measure-Learn loop applies beyond startups.", tags: ["business", "startup", "lean"] },
  { id: 3, title: "Deep Work", author: "Cal Newport", rating: 4, highlights: [
    "Clarity about what matters provides clarity about what does not.",
  ], reflection: "Made me rethink my relationship with shallow work. Time-blocking has been transformative.", tags: ["productivity", "focus", "work"] },
];

export function App() {
  const [books, setBooks] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", rating: 4, reflection: "", highlights: "", tags: "" });

  const filtered = useMemo(() => {
    if (!search) return books;
    const q = search.toLowerCase();
    return books.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.tags.some((t) => t.includes(q)));
  }, [books, search]);

  const addBook = useCallback(() => {
    if (!form.title.trim()) return;
    setBooks((prev) => [...prev, {
      id: nextId++, title: form.title.trim(), author: form.author.trim(), rating: form.rating,
      highlights: form.highlights.split("\\n").map((h) => h.trim()).filter(Boolean),
      reflection: form.reflection.trim(),
      tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    }]);
    setForm({ title: "", author: "", rating: 4, reflection: "", highlights: "", tags: "" });
    setAdding(false);
  }, [form]);

  const deleteBook = useCallback((id) => { setBooks((prev) => prev.filter((b) => b.id !== id)); if (selected === id) setSelected(null); }, [selected]);

  const detail = books.find((b) => b.id === selected);
  const allTags = useMemo(() => [...new Set(books.flatMap((b) => b.tags))].sort(), [books]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BookOpen size={20} /> Book Notes</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books, authors, tags..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        {allTags.length > 0 && (
          <div className="flex gap-1.5 mb-4 overflow-x-auto">
            {allTags.map((t) => (
              <button key={t} onClick={() => setSearch(t)} className="rounded-full bg-zinc-900 border border-white/5 px-2.5 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 whitespace-nowrap">
                #{t}
              </button>
            ))}
          </div>
        )}

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Book Notes</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <input placeholder="Book title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <input placeholder="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Rating</label>
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, rating: s })}><Star size={18} className={s <= form.rating ? "text-amber-400" : "text-zinc-700"} fill={s <= form.rating ? "currentColor" : "none"} /></button>
                ))}</div>
              </div>
              <textarea placeholder="Key highlights (one per line)" value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} rows={3} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none" />
              <textarea placeholder="Your reflection / takeaways" value={form.reflection} onChange={(e) => setForm({ ...form, reflection: e.target.value })} rows={2} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none" />
              <input placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <button onClick={addBook} className="w-full mt-3 rounded-xl bg-amber-700 py-2.5 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Save Notes</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">{detail.title}</h2>
                <p className="text-xs text-zinc-500">{detail.author}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex gap-0.5 mb-4">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={14} className={s <= detail.rating ? "text-amber-400" : "text-zinc-700"} fill={s <= detail.rating ? "currentColor" : "none"} />)}</div>

            {detail.highlights.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1"><Lightbulb size={11} /> Key Highlights</h3>
                <div className="space-y-2">
                  {detail.highlights.map((h, i) => (
                    <div key={i} className="border-l-2 border-amber-600/40 pl-3">
                      <p className="text-sm text-zinc-300 italic">"{h}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.reflection && (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1"><PenLine size={11} /> My Reflection</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{detail.reflection}</p>
              </div>
            )}

            {detail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {detail.tags.map((t) => <span key={t} className="rounded-full bg-amber-700/20 px-2 py-0.5 text-[10px] text-amber-400">#{t}</span>)}
              </div>
            )}

            <button onClick={() => deleteBook(detail.id)} className="text-xs text-red-400 hover:text-red-300">Delete notes</button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No books found</p>}
            {filtered.map((b) => (
              <button key={b.id} onClick={() => { setSelected(b.id); setAdding(false); }} className="w-full text-left rounded-2xl bg-zinc-900 border border-white/5 p-4 hover:border-white/10 transition-colors">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-medium text-white">{b.title}</h3>
                    <p className="text-xs text-zinc-500">{b.author}</p>
                  </div>
                  <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={9} className={s <= b.rating ? "text-amber-400" : "text-zinc-800"} fill={s <= b.rating ? "currentColor" : "none"} />)}</div>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{b.reflection}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600">{b.highlights.length} highlight{b.highlights.length !== 1 ? "s" : ""}</span>
                  {b.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] text-zinc-600">#{t}</span>)}
                </div>
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
