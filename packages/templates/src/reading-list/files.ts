import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Star, BookOpen, Search, X } from "lucide-react";

let nextId = 10;
const SAMPLE = [
  { id: 1, title: "Atomic Habits", author: "James Clear", status: "completed", rating: 5, notes: "Life-changing book on habit formation" },
  { id: 2, title: "Dune", author: "Frank Herbert", status: "reading", rating: 0, notes: "Currently on chapter 12" },
  { id: 3, title: "The Lean Startup", author: "Eric Ries", status: "to-read", rating: 0, notes: "" },
  { id: 4, title: "Project Hail Mary", author: "Andy Weir", status: "completed", rating: 4, notes: "Great sci-fi, loved the humor" },
];

export function App() {
  const [books, setBooks] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");

  const addBook = useCallback(() => {
    if (!newTitle.trim()) return;
    setBooks((prev) => [...prev, { id: nextId++, title: newTitle.trim(), author: newAuthor.trim(), status: "to-read", rating: 0, notes: "" }]);
    setNewTitle("");
    setNewAuthor("");
    setAdding(false);
  }, [newTitle, newAuthor]);

  const deleteBook = useCallback((id) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateStatus = useCallback((id, status) => {
    setBooks((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
  }, []);

  const updateRating = useCallback((id, rating) => {
    setBooks((prev) => prev.map((b) => b.id === id ? { ...b, rating } : b));
  }, []);

  const filtered = useMemo(() => {
    let list = books;
    if (filter !== "all") list = list.filter((b) => b.status === filter);
    if (search) list = list.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [books, filter, search]);

  const counts = useMemo(() => ({
    all: books.length,
    "to-read": books.filter((b) => b.status === "to-read").length,
    reading: books.filter((b) => b.status === "reading").length,
    completed: books.filter((b) => b.status === "completed").length,
  }), [books]);

  const statusColors = { "to-read": "bg-zinc-600", reading: "bg-blue-600", completed: "bg-green-600" };
  const statusLabels = { "to-read": "To Read", reading: "Reading", completed: "Completed" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><BookOpen size={20} /> Reading List</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Book</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <input placeholder="Author" value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-3" />
            <button onClick={addBook} className="w-full rounded-xl bg-amber-700 py-2.5 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Add Book</button>
          </div>
        )}

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {(["all", "to-read", "reading", "completed"]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={"rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all " + (filter === f ? "bg-amber-700 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              {f === "all" ? "All" : statusLabels[f]} ({counts[f]})
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No books found</p>}
          {filtered.map((book) => (
            <div key={book.id} className="group rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-medium text-white">{book.title}</h3>
                  <p className="text-xs text-zinc-500">{book.author}</p>
                </div>
                <button onClick={() => deleteBook(book.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"><Trash2 size={14} /></button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {(["to-read", "reading", "completed"]).map((s) => (
                    <button key={s} onClick={() => updateStatus(book.id, s)} className={"rounded-full px-2 py-0.5 text-[10px] font-medium transition-all " + (book.status === s ? statusColors[s] + " text-white" : "bg-zinc-800 text-zinc-600 hover:text-zinc-400")}>
                      {statusLabels[s]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => updateRating(book.id, s)}>
                      <Star size={12} className={s <= book.rating ? "text-amber-400" : "text-zinc-700"} fill={s <= book.rating ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
