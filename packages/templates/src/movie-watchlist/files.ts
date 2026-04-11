import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Star, Search, X, Film, Eye, EyeOff } from "lucide-react";

let nextId = 20;
const GENRES = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Thriller", "Animation", "Documentary"];

const SAMPLE = [
  { id: 1, title: "Inception", year: 2010, genre: "Sci-Fi", watched: true, rating: 5, review: "Mind-bending masterpiece. The layered dream concept is brilliant." },
  { id: 2, title: "The Grand Budapest Hotel", year: 2014, genre: "Comedy", watched: true, rating: 4, review: "Visually stunning. Wes Anderson at his finest." },
  { id: 3, title: "Dune: Part Two", year: 2024, genre: "Sci-Fi", watched: false, rating: 0, review: "" },
  { id: 4, title: "Parasite", year: 2019, genre: "Thriller", watched: true, rating: 5, review: "Brilliant social commentary. Every scene is perfect." },
  { id: 5, title: "The Batman", year: 2022, genre: "Action", watched: false, rating: 0, review: "" },
  { id: 6, title: "Everything Everywhere All at Once", year: 2022, genre: "Sci-Fi", watched: true, rating: 5, review: "Wildly creative and surprisingly emotional." },
];

export function App() {
  const [movies, setMovies] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", year: "", genre: "Action" });
  const [selected, setSelected] = useState(null);
  const [editReview, setEditReview] = useState("");

  const filtered = useMemo(() => {
    let list = movies;
    if (genreFilter !== "All") list = list.filter((m) => m.genre === genreFilter);
    if (statusFilter === "watched") list = list.filter((m) => m.watched);
    if (statusFilter === "watchlist") list = list.filter((m) => !m.watched);
    if (search) list = list.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [movies, search, genreFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: movies.length,
    watched: movies.filter((m) => m.watched).length,
    watchlist: movies.filter((m) => !m.watched).length,
    avgRating: movies.filter((m) => m.watched && m.rating > 0).length > 0
      ? (movies.filter((m) => m.watched && m.rating > 0).reduce((s, m) => s + m.rating, 0) / movies.filter((m) => m.watched && m.rating > 0).length).toFixed(1)
      : "0",
  }), [movies]);

  const addMovie = useCallback(() => {
    if (!form.title.trim()) return;
    setMovies((prev) => [...prev, { id: nextId++, title: form.title.trim(), year: parseInt(form.year) || 0, genre: form.genre, watched: false, rating: 0, review: "" }]);
    setForm({ title: "", year: "", genre: "Action" }); setAdding(false);
  }, [form]);

  const deleteMovie = useCallback((id) => { setMovies((prev) => prev.filter((m) => m.id !== id)); if (selected === id) setSelected(null); }, [selected]);

  const toggleWatched = useCallback((id) => {
    setMovies((prev) => prev.map((m) => m.id === id ? { ...m, watched: !m.watched } : m));
  }, []);

  const setRating = useCallback((id, rating) => {
    setMovies((prev) => prev.map((m) => m.id === id ? { ...m, rating } : m));
  }, []);

  const saveReview = useCallback((id) => {
    setMovies((prev) => prev.map((m) => m.id === id ? { ...m, review: editReview } : m));
  }, [editReview]);

  const detail = movies.find((m) => m.id === selected);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Film size={20} className="text-purple-400" /> Movies</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2 text-center">
            <span className="text-lg font-bold text-white">{stats.total}</span>
            <p className="text-[10px] text-zinc-500">Total</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2 text-center">
            <span className="text-lg font-bold text-green-400">{stats.watched}</span>
            <p className="text-[10px] text-zinc-500">Watched</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2 text-center">
            <span className="text-lg font-bold text-purple-400">{stats.watchlist}</span>
            <p className="text-[10px] text-zinc-500">Watchlist</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2 text-center">
            <div className="flex justify-center items-center gap-0.5">
              <Star size={10} className="text-amber-400" fill="currentColor" />
              <span className="text-lg font-bold text-white">{stats.avgRating}</span>
            </div>
            <p className="text-[10px] text-zinc-500">Avg</p>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search movies..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-1 mb-2">
          {["all", "watchlist", "watched"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={"rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all " + (statusFilter === s ? "bg-purple-600 text-white" : "bg-zinc-900 text-zinc-500")}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {["All", ...GENRES].map((g) => (
            <button key={g} onClick={() => setGenreFilter(g)} className={"rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition-all " + (genreFilter === g ? "bg-zinc-700 text-white" : "text-zinc-600 hover:text-zinc-400")}>
              {g}
            </button>
          ))}
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-white">Add Movie</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Movie title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <div className="flex gap-2 mb-3">
              <input placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="w-20 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <select value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                {GENRES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <button onClick={addMovie} className="w-full rounded-xl bg-purple-600 py-2.5 text-white text-sm font-medium">Add to Watchlist</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">{detail.title}</h2>
                <p className="text-xs text-zinc-500">{detail.year > 0 ? detail.year + " · " : ""}{detail.genre}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <button onClick={() => toggleWatched(detail.id)} className={"flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium mb-3 " + (detail.watched ? "bg-green-600/20 text-green-400" : "bg-zinc-800 text-zinc-400")}>
              {detail.watched ? <Eye size={13} /> : <EyeOff size={13} />}
              {detail.watched ? "Watched" : "Not watched"}
            </button>
            {detail.watched && (
              <div className="mb-3">
                <span className="text-xs text-zinc-500 mb-1 block">Rating</span>
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => setRating(detail.id, s)}><Star size={20} className={s <= detail.rating ? "text-amber-400" : "text-zinc-700"} fill={s <= detail.rating ? "currentColor" : "none"} /></button>
                ))}</div>
              </div>
            )}
            <div>
              <span className="text-xs text-zinc-500 mb-1 block">Review</span>
              <textarea defaultValue={detail.review} onChange={(e) => setEditReview(e.target.value)} onBlur={() => saveReview(detail.id)} placeholder="Your thoughts..." rows={3} className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed" />
            </div>
            <button onClick={() => deleteMovie(detail.id)} className="mt-2 text-xs text-red-400 hover:text-red-300">Delete</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No movies found</p>}
            {filtered.map((m) => (
              <button key={m.id} onClick={() => { setSelected(m.id); setAdding(false); setEditReview(m.review); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors">
                <div className={"flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 text-xs " + (m.watched ? "bg-green-600/20 text-green-400" : "bg-purple-600/20 text-purple-400")}>
                  {m.watched ? <Eye size={14} /> : <EyeOff size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{m.title}</span>
                  <p className="text-xs text-zinc-500">{m.year > 0 ? m.year + " · " : ""}{m.genre}</p>
                </div>
                {m.watched && m.rating > 0 && (
                  <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={9} className={s <= m.rating ? "text-amber-400" : "text-zinc-800"} fill={s <= m.rating ? "currentColor" : "none"} />)}</div>
                )}
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
