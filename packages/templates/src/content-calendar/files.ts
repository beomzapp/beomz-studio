import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, ChevronLeft, ChevronRight, X, Calendar } from "lucide-react";

let nextId = 20;
const PLATFORMS = ["Twitter", "Instagram", "LinkedIn", "TikTok", "Blog"];
const PLATFORM_COLORS = { Twitter: "bg-sky-500", Instagram: "bg-pink-500", LinkedIn: "bg-blue-600", TikTok: "bg-zinc-600", Blog: "bg-green-600" };
const STATUSES = ["Idea", "Draft", "Scheduled", "Published"];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function toKey(y, m, d) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }

export function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [posts, setPosts] = useState([
    { id: 1, date: toKey(today.getFullYear(), today.getMonth(), 5), title: "Product launch thread", platform: "Twitter", status: "Scheduled" },
    { id: 2, date: toKey(today.getFullYear(), today.getMonth(), 5), title: "Behind the scenes reel", platform: "Instagram", status: "Draft" },
    { id: 3, date: toKey(today.getFullYear(), today.getMonth(), 12), title: "Case study post", platform: "LinkedIn", status: "Idea" },
    { id: 4, date: toKey(today.getFullYear(), today.getMonth(), 18), title: "Tutorial video", platform: "TikTok", status: "Idea" },
    { id: 5, date: toKey(today.getFullYear(), today.getMonth(), 22), title: "Monthly roundup blog", platform: "Blog", status: "Draft" },
  ]);
  const [adding, setAdding] = useState(null);
  const [form, setForm] = useState({ title: "", platform: "Twitter", status: "Idea" });

  const daysCount = getDaysInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const monthName = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = useCallback(() => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); }, [month]);
  const nextMonth = useCallback(() => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); }, [month]);

  const addPost = useCallback((dateKey) => {
    if (!form.title.trim()) return;
    setPosts((prev) => [...prev, { id: nextId++, date: dateKey, title: form.title.trim(), platform: form.platform, status: form.status }]);
    setForm({ title: "", platform: "Twitter", status: "Idea" }); setAdding(null);
  }, [form]);

  const removePost = useCallback((id) => { setPosts((prev) => prev.filter((p) => p.id !== id)); }, []);

  const statusIcon = { Idea: "💡", Draft: "📝", Scheduled: "📅", Published: "✅" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Calendar size={20} /> Content Calendar</h1>
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="text-zinc-500 hover:text-white"><ChevronLeft size={18} /></button>
            <span className="text-sm font-medium text-white w-36 text-center">{monthName}</span>
            <button onClick={nextMonth} className="text-zinc-500 hover:text-white"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-[10px] text-zinc-600 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }).map((_, i) => <div key={"e" + i} className="min-h-[80px]" />)}
          {Array.from({ length: daysCount }).map((_, i) => {
            const day = i + 1;
            const key = toKey(year, month, day);
            const dayPosts = posts.filter((p) => p.date === key);
            const isToday = key === toKey(today.getFullYear(), today.getMonth(), today.getDate());
            return (
              <div key={day} className={"min-h-[80px] rounded-lg border p-1.5 " + (isToday ? "border-rose-500/30 bg-rose-600/5" : "border-white/5 bg-zinc-900/50")}>
                <div className="flex items-center justify-between mb-1">
                  <span className={"text-xs font-medium " + (isToday ? "text-rose-400" : "text-zinc-500")}>{day}</span>
                  <button onClick={() => setAdding(key)} className="text-zinc-700 hover:text-zinc-400"><Plus size={10} /></button>
                </div>
                <div className="space-y-0.5">
                  {dayPosts.map((p) => (
                    <div key={p.id} className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-800/60">
                      <div className={"h-1.5 w-1.5 rounded-full flex-shrink-0 " + (PLATFORM_COLORS[p.platform] || "bg-zinc-500")} />
                      <span className="text-[10px] text-zinc-300 truncate flex-1">{p.title}</span>
                      <button onClick={() => removePost(p.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={8} /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {adding && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setAdding(null)}>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-white">Add Post — {adding}</span>
                <button onClick={() => setAdding(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
              </div>
              <input placeholder="Post title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" autoFocus />
              <div className="flex gap-2 mb-3">
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={() => addPost(adding)} className="w-full rounded-xl bg-rose-600 py-2.5 text-white text-sm font-medium hover:bg-rose-500 transition-colors">Add Post</button>
            </div>
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
