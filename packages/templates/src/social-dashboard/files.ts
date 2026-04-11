import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { TrendingUp, TrendingDown, Users, Heart, Eye, Share2, BarChart3, Clock } from "lucide-react";

const PLATFORMS = [
  { id: "instagram", name: "Instagram", emoji: "📸", followers: "24.8K", growth: "+2.1%", up: true, color: "bg-pink-500" },
  { id: "twitter", name: "Twitter/X", emoji: "𝕏", followers: "18.3K", growth: "+1.4%", up: true, color: "bg-zinc-600" },
  { id: "tiktok", name: "TikTok", emoji: "🎵", followers: "41.2K", growth: "+5.8%", up: true, color: "bg-zinc-700" },
  { id: "youtube", name: "YouTube", emoji: "📺", followers: "12.1K", growth: "-0.3%", up: false, color: "bg-red-600" },
];

const POSTS = [
  { id: 1, platform: "instagram", content: "Behind the scenes of our latest shoot", likes: 2840, comments: 142, shares: 89, reach: "18.2K", posted: "2h ago" },
  { id: 2, platform: "twitter", content: "5 lessons from building in public this year", likes: 1420, comments: 238, shares: 412, reach: "45.1K", posted: "5h ago" },
  { id: 3, platform: "tiktok", content: "Day in the life of a startup founder", likes: 8900, comments: 567, shares: 1200, reach: "120K", posted: "1d ago" },
  { id: 4, platform: "instagram", content: "Product launch announcement", likes: 3200, comments: 198, shares: 156, reach: "22.4K", posted: "2d ago" },
  { id: 5, platform: "youtube", content: "Complete guide to building your first SaaS", likes: 890, comments: 67, shares: 45, reach: "8.7K", posted: "3d ago" },
];

const SCHEDULE = [
  { id: 1, platform: "twitter", content: "Thread: How we grew to 10K users", time: "Tomorrow, 10:00 AM" },
  { id: 2, platform: "instagram", content: "New feature carousel post", time: "Tomorrow, 2:00 PM" },
  { id: 3, platform: "tiktok", content: "Quick tip video #productiviy", time: "Apr 13, 11:00 AM" },
];

const WEEKLY = [65, 72, 58, 84, 91, 78, 95];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);

export function App() {
  const [tab, setTab] = useState("overview");

  const totalFollowers = "96.4K";
  const totalEngagement = "4.2%";
  const totalReach = "214K";
  const maxBar = Math.max(...WEEKLY);

  return (
    <div className="min-h-screen bg-[#060612] text-white p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><BarChart3 size={20} className="text-orange-400" /> Social Dashboard</h1>
            <p className="text-sm text-zinc-500">Your cross-platform analytics</p>
          </div>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {["overview", "posts", "schedule"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (tab === t ? "bg-zinc-800 text-white" : "text-zinc-500")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {PLATFORMS.map((p) => (
            <div key={p.id} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{p.emoji}</span>
                <span className={"flex items-center gap-0.5 text-xs font-medium " + (p.up ? "text-green-400" : "text-red-400")}>
                  {p.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{p.growth}
                </span>
              </div>
              <p className="text-xl font-bold">{p.followers}</p>
              <p className="text-xs text-zinc-500">{p.name}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 text-center">
            <Users size={16} className="mx-auto text-orange-400 mb-2" />
            <p className="text-2xl font-bold">{totalFollowers}</p>
            <p className="text-xs text-zinc-500">Total Followers</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 text-center">
            <Heart size={16} className="mx-auto text-pink-400 mb-2" />
            <p className="text-2xl font-bold">{totalEngagement}</p>
            <p className="text-xs text-zinc-500">Engagement Rate</p>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 text-center">
            <Eye size={16} className="mx-auto text-cyan-400 mb-2" />
            <p className="text-2xl font-bold">{totalReach}</p>
            <p className="text-xs text-zinc-500">Weekly Reach</p>
          </div>
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-3 rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <h2 className="text-sm font-medium mb-4">Engagement This Week</h2>
              <div className="flex items-end gap-2 h-32">
                {WEEKLY.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                    <div className="w-full rounded-t bg-orange-500/80 hover:bg-orange-400 transition-colors" style={{ height: Math.max(8, (val / maxBar) * 100) + "%" }} />
                    <span className="text-[9px] text-zinc-600 mt-1.5">{DAYS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <h2 className="text-sm font-medium mb-4 flex items-center gap-1"><Clock size={13} /> Upcoming</h2>
              <div className="space-y-3">
                {SCHEDULE.map((s) => {
                  const p = PLATFORMS.find((pl) => pl.id === s.platform);
                  return (
                    <div key={s.id} className="flex items-start gap-3">
                      <span className="text-lg">{p?.emoji}</span>
                      <div>
                        <p className="text-sm text-zinc-300">{s.content}</p>
                        <p className="text-xs text-zinc-600">{s.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "posts" && (
          <div className="space-y-2">
            {POSTS.map((post) => {
              const p = PLATFORMS.find((pl) => pl.id === post.platform);
              return (
                <div key={post.id} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span>{p?.emoji}</span>
                    <span className="text-xs text-zinc-500">{p?.name}</span>
                    <span className="text-xs text-zinc-700 ml-auto">{post.posted}</span>
                  </div>
                  <p className="text-sm text-zinc-300 mb-3">{post.content}</p>
                  <div className="flex gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><Heart size={11} className="text-pink-400" /> {fmt(post.likes)}</span>
                    <span className="flex items-center gap-1">💬 {fmt(post.comments)}</span>
                    <span className="flex items-center gap-1"><Share2 size={11} /> {fmt(post.shares)}</span>
                    <span className="flex items-center gap-1 ml-auto"><Eye size={11} className="text-cyan-400" /> {post.reach}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "schedule" && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <h2 className="text-sm font-medium mb-4">Scheduled Posts</h2>
            <div className="space-y-3">
              {SCHEDULE.map((s) => {
                const p = PLATFORMS.find((pl) => pl.id === s.platform);
                return (
                  <div key={s.id} className="flex items-center gap-4 rounded-xl bg-zinc-800/60 px-4 py-3">
                    <span className="text-xl">{p?.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm text-white">{s.content}</p>
                      <p className="text-xs text-zinc-500">{p?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-orange-400">{s.time}</p>
                    </div>
                  </div>
                );
              })}
              {SCHEDULE.length === 0 && <p className="text-center text-sm text-zinc-600 py-8">No scheduled posts</p>}
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
