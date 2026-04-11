import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Send, Clock, Edit3, X } from "lucide-react";

let nextId = 20;
const PLATFORMS = [
  { id: "twitter", name: "Twitter/X", emoji: "𝕏", color: "bg-zinc-600" },
  { id: "instagram", name: "Instagram", emoji: "📸", color: "bg-pink-600" },
  { id: "linkedin", name: "LinkedIn", emoji: "💼", color: "bg-blue-700" },
  { id: "tiktok", name: "TikTok", emoji: "🎵", color: "bg-zinc-700" },
];

const SAMPLE = [
  { id: 1, content: "Excited to announce our new feature launch! Check it out now.", platforms: ["twitter", "linkedin"], scheduledDate: "2024-04-12", scheduledTime: "10:00", status: "scheduled" },
  { id: 2, content: "Behind the scenes of our product development process. Thread:", platforms: ["twitter"], scheduledDate: "2024-04-13", scheduledTime: "14:00", status: "draft" },
  { id: 3, content: "5 tips for building better products. Swipe to learn more!", platforms: ["instagram", "tiktok"], scheduledDate: "2024-04-14", scheduledTime: "11:00", status: "draft" },
  { id: 4, content: "We just hit 10k users! Thank you all for the incredible support.", platforms: ["twitter", "instagram", "linkedin"], scheduledDate: "", scheduledTime: "", status: "draft" },
];

export function App() {
  const [posts, setPosts] = useState(SAMPLE);
  const [tab, setTab] = useState("queue");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ content: "", platforms: ["twitter"], scheduledDate: "", scheduledTime: "" });

  const drafts = useMemo(() => posts.filter((p) => p.status === "draft"), [posts]);
  const scheduled = useMemo(() => posts.filter((p) => p.status === "scheduled").sort((a, b) => (a.scheduledDate + a.scheduledTime).localeCompare(b.scheduledDate + b.scheduledTime)), [posts]);
  const published = useMemo(() => posts.filter((p) => p.status === "published"), [posts]);

  const togglePlatform = useCallback((platformId) => {
    setForm((prev) => {
      const has = prev.platforms.includes(platformId);
      return { ...prev, platforms: has ? prev.platforms.filter((p) => p !== platformId) : [...prev.platforms, platformId] };
    });
  }, []);

  const addPost = useCallback(() => {
    if (!form.content.trim()) return;
    setPosts((prev) => [{ id: nextId++, content: form.content.trim(), platforms: form.platforms, scheduledDate: form.scheduledDate, scheduledTime: form.scheduledTime, status: form.scheduledDate ? "scheduled" : "draft" }, ...prev]);
    setForm({ content: "", platforms: ["twitter"], scheduledDate: "", scheduledTime: "" }); setAdding(false);
  }, [form]);

  const deletePost = useCallback((id) => { setPosts((prev) => prev.filter((p) => p.id !== id)); }, []);
  const schedulePost = useCallback((id) => { setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status: "scheduled" } : p)); }, []);
  const publishPost = useCallback((id) => { setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status: "published" } : p)); }, []);

  const displayed = tab === "queue" ? [...drafts, ...scheduled] : published;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Send size={20} className="text-purple-400" /> Post Scheduler</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">
            <Plus size={14} /> Create
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-zinc-400">{drafts.length}</span>
            <p className="text-[10px] text-zinc-500">Drafts</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-purple-400">{scheduled.length}</span>
            <p className="text-[10px] text-zinc-500">Scheduled</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-green-400">{published.length}</span>
            <p className="text-[10px] text-zinc-500">Published</p>
          </div>
        </div>

        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-4">
          {["queue", "published"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={"flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-all " + (tab === t ? "bg-zinc-800 text-white" : "text-zinc-500")}>
              {t}
            </button>
          ))}
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Post</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <textarea placeholder="What do you want to share?" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={3} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none mb-3" />
            <div className="flex gap-1.5 mb-3">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => togglePlatform(p.id)} className={"flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all " + (form.platforms.includes(p.id) ? p.color + " text-white" : "bg-zinc-800 text-zinc-500")}>
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none" />
              <input type="time" value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} className="w-28 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none" />
            </div>
            <button onClick={addPost} className="w-full rounded-xl bg-purple-600 py-2.5 text-white text-sm font-medium hover:bg-purple-500 transition-colors">
              {form.scheduledDate ? "Schedule Post" : "Save Draft"}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {displayed.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">{tab === "queue" ? "No posts in queue" : "No published posts"}</p>}
          {displayed.map((post) => (
            <div key={post.id} className="group rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <p className="text-sm text-zinc-300 mb-3 leading-relaxed">{post.content}</p>
              <div className="flex items-center gap-2 mb-2">
                {post.platforms.map((pid) => {
                  const p = PLATFORMS.find((pl) => pl.id === pid);
                  return p ? <span key={pid} className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + p.color + " text-white"}>{p.emoji} {p.name}</span> : null;
                })}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {post.scheduledDate && <span className="flex items-center gap-1"><Clock size={10} /> {post.scheduledDate} {post.scheduledTime}</span>}
                  <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-medium " + (post.status === "draft" ? "bg-zinc-700 text-zinc-300" : post.status === "scheduled" ? "bg-purple-600/20 text-purple-400" : "bg-green-600/20 text-green-400")}>{post.status}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {post.status === "draft" && <button onClick={() => schedulePost(post.id)} className="text-xs text-purple-400 hover:text-purple-300">Schedule</button>}
                  {post.status === "scheduled" && <button onClick={() => publishPost(post.id)} className="text-xs text-green-400 hover:text-green-300">Publish</button>}
                  <button onClick={() => deletePost(post.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
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
