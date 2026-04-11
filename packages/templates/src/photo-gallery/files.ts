import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Heart, X, Grid, ChevronLeft, ChevronRight, Plus } from "lucide-react";

const EMOJIS = ["🌅", "🏔️", "🌊", "🌸", "🏙️", "🌿", "🦋", "🌄", "🎨", "🌺", "⛰️", "🌇"];
const ALBUMS = ["All", "Nature", "City", "Abstract"];

const PHOTOS = [
  { id: 1, emoji: "🌅", title: "Golden Hour", album: "Nature", liked: true },
  { id: 2, emoji: "🏙️", title: "Downtown Lights", album: "City", liked: false },
  { id: 3, emoji: "🌊", title: "Ocean Waves", album: "Nature", liked: true },
  { id: 4, emoji: "🎨", title: "Color Splash", album: "Abstract", liked: false },
  { id: 5, emoji: "🏔️", title: "Mountain Peak", album: "Nature", liked: false },
  { id: 6, emoji: "🌇", title: "Sunset Boulevard", album: "City", liked: true },
  { id: 7, emoji: "🌸", title: "Cherry Blossoms", album: "Nature", liked: false },
  { id: 8, emoji: "🌿", title: "Forest Path", album: "Nature", liked: false },
  { id: 9, emoji: "🦋", title: "Butterfly Wings", album: "Nature", liked: true },
  { id: 10, emoji: "⛰️", title: "Alpine Lake", album: "Nature", liked: false },
  { id: 11, emoji: "🌄", title: "Dawn Mist", album: "Nature", liked: false },
  { id: 12, emoji: "🌺", title: "Tropical Garden", album: "Nature", liked: false },
];

const BG_COLORS = ["bg-amber-600", "bg-slate-700", "bg-cyan-700", "bg-rose-600", "bg-emerald-700", "bg-violet-700", "bg-pink-600", "bg-green-700", "bg-purple-600", "bg-teal-700", "bg-orange-700", "bg-indigo-600"];

export function App() {
  const [photos, setPhotos] = useState(PHOTOS);
  const [album, setAlbum] = useState("All");
  const [lightbox, setLightbox] = useState(null);
  const [showLiked, setShowLiked] = useState(false);

  const filtered = useMemo(() => {
    let list = photos;
    if (album !== "All") list = list.filter((p) => p.album === album);
    if (showLiked) list = list.filter((p) => p.liked);
    return list;
  }, [photos, album, showLiked]);

  const toggleLike = useCallback((id) => {
    setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, liked: !p.liked } : p));
  }, []);

  const lbPhoto = lightbox !== null ? photos.find((p) => p.id === lightbox) : null;
  const lbIdx = lbPhoto ? filtered.findIndex((p) => p.id === lbPhoto.id) : -1;
  const lbPrev = useCallback(() => { if (lbIdx > 0) setLightbox(filtered[lbIdx - 1].id); }, [lbIdx, filtered]);
  const lbNext = useCallback(() => { if (lbIdx < filtered.length - 1) setLightbox(filtered[lbIdx + 1].id); }, [lbIdx, filtered]);

  return (
    <div className="min-h-screen bg-[#060612] text-white p-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold flex items-center gap-2"><Grid size={20} className="text-purple-400" /> Gallery</h1>
          <button onClick={() => setShowLiked((s) => !s)} className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-all " + (showLiked ? "bg-red-500/20 text-red-400" : "bg-zinc-900 text-zinc-500")}>
            <Heart size={12} className="inline mr-1" fill={showLiked ? "currentColor" : "none"} />Favorites
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          {ALBUMS.map((a) => (
            <button key={a} onClick={() => setAlbum(a)} className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-all " + (album === a ? "bg-purple-600 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              {a}
            </button>
          ))}
        </div>

        <div className="columns-2 md:columns-3 gap-3 space-y-3">
          {filtered.map((photo, i) => {
            const tall = i % 3 === 0;
            return (
              <div key={photo.id} className="break-inside-avoid group relative cursor-pointer" onClick={() => setLightbox(photo.id)}>
                <div className={"rounded-xl flex items-center justify-center text-5xl " + BG_COLORS[photo.id % BG_COLORS.length] + (tall ? " h-52" : " h-36")}>
                  {photo.emoji}
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-colors flex items-end p-3 opacity-0 group-hover:opacity-100">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{photo.title}</p>
                    <p className="text-xs text-zinc-300">{photo.album}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleLike(photo.id); }} className={photo.liked ? "text-red-400" : "text-white/60"}>
                    <Heart size={16} fill={photo.liked ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-12">No photos found</p>}

        {lbPhoto && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
            <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-4 right-4 text-white/60 hover:text-white"><X size={24} /></button>
            {lbIdx > 0 && <button onClick={(e) => { e.stopPropagation(); lbPrev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"><ChevronLeft size={32} /></button>}
            {lbIdx < filtered.length - 1 && <button onClick={(e) => { e.stopPropagation(); lbNext(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"><ChevronRight size={32} /></button>}
            <div onClick={(e) => e.stopPropagation()} className="text-center">
              <div className={"rounded-2xl flex items-center justify-center text-8xl w-72 h-72 " + BG_COLORS[lbPhoto.id % BG_COLORS.length]}>
                {lbPhoto.emoji}
              </div>
              <p className="text-lg font-medium mt-4">{lbPhoto.title}</p>
              <p className="text-sm text-zinc-400">{lbPhoto.album}</p>
              <button onClick={() => toggleLike(lbPhoto.id)} className={"mt-2 " + (lbPhoto.liked ? "text-red-400" : "text-zinc-500")}>
                <Heart size={20} fill={lbPhoto.liked ? "currentColor" : "none"} />
              </button>
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
