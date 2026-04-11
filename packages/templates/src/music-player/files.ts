import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Volume2, Heart } from "lucide-react";

const TRACKS = [
  { id: 1, title: "Midnight Drive", artist: "Neon Pulse", duration: "3:42", album: "Electric Dreams" },
  { id: 2, title: "Solar Winds", artist: "Stellar", duration: "4:15", album: "Cosmos" },
  { id: 3, title: "Digital Rain", artist: "Cyber Wave", duration: "3:58", album: "Binary Sunset" },
  { id: 4, title: "Crystal Caves", artist: "Echo Drift", duration: "5:01", album: "Deep Earth" },
  { id: 5, title: "Neon Streets", artist: "Neon Pulse", duration: "3:27", album: "Electric Dreams" },
  { id: 6, title: "Gravity", artist: "Stellar", duration: "4:33", album: "Cosmos" },
  { id: 7, title: "Phosphor", artist: "Cyber Wave", duration: "3:12", album: "Binary Sunset" },
  { id: 8, title: "Afterglow", artist: "Echo Drift", duration: "4:48", album: "Deep Earth" },
];

const COLORS = ["bg-orange-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500", "bg-rose-500", "bg-teal-500"];

export function App() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(35);
  const [liked, setLiked] = useState(new Set([1, 4]));
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const track = TRACKS[currentIdx];

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const next = useCallback(() => setCurrentIdx((i) => (i + 1) % TRACKS.length), []);
  const prev = useCallback(() => setCurrentIdx((i) => (i - 1 + TRACKS.length) % TRACKS.length), []);
  const toggleLike = useCallback((id) => setLiked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const selectTrack = useCallback((idx) => { setCurrentIdx(idx); setPlaying(true); setProgress(0); }, []);

  return (
    <div className="min-h-screen bg-[#060612] text-white">
      <div className="mx-auto max-w-md p-4 pb-36">
        <h1 className="text-xl font-semibold mb-5">Now Playing</h1>

        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 mb-5 text-center">
          <div className={"w-32 h-32 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl " + COLORS[currentIdx % COLORS.length]}>
            🎵
          </div>
          <h2 className="text-lg font-semibold">{track.title}</h2>
          <p className="text-sm text-zinc-400">{track.artist} — {track.album}</p>

          <div className="mt-5 px-2">
            <div className="w-full h-1 bg-zinc-800 rounded-full cursor-pointer" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setProgress(Math.round(((e.clientX - rect.left) / rect.width) * 100)); }}>
              <div className="h-1 bg-orange-500 rounded-full relative" style={{ width: progress + "%" }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow" />
              </div>
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-zinc-600">
              <span>1:{String(Math.round(progress * 0.42)).padStart(2, "0")}</span>
              <span>{track.duration}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-5 mt-4">
            <button onClick={() => setShuffle((s) => !s)} className={shuffle ? "text-orange-400" : "text-zinc-600"}><Shuffle size={16} /></button>
            <button onClick={prev} className="text-zinc-300 hover:text-white"><SkipBack size={20} /></button>
            <button onClick={togglePlay} className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-400 transition-colors">
              {playing ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
            </button>
            <button onClick={next} className="text-zinc-300 hover:text-white"><SkipForward size={20} /></button>
            <button onClick={() => setRepeat((r) => !r)} className={repeat ? "text-orange-400" : "text-zinc-600"}><Repeat size={16} /></button>
          </div>
        </div>

        <h2 className="text-sm font-medium text-zinc-400 mb-3">Queue</h2>
        <div className="space-y-1">
          {TRACKS.map((t, i) => (
            <button key={t.id} onClick={() => selectTrack(i)} className={"w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all " + (i === currentIdx ? "bg-orange-500/10 border border-orange-500/20" : "hover:bg-zinc-900")}>
              <div className={"h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold " + (i === currentIdx ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-500")}>
                {i === currentIdx && playing ? "♫" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={"text-sm truncate " + (i === currentIdx ? "text-orange-400 font-medium" : "text-white")}>{t.title}</p>
                <p className="text-xs text-zinc-500">{t.artist}</p>
              </div>
              <span className="text-xs text-zinc-600">{t.duration}</span>
              <button onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }} className={liked.has(t.id) ? "text-red-400" : "text-zinc-700 hover:text-red-400"}>
                <Heart size={14} fill={liked.has(t.id) ? "currentColor" : "none"} />
              </button>
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
