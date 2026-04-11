import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, Trash2, ExternalLink, X, GripVertical, Palette } from "lucide-react";

let nextId = 20;

const THEMES = [
  { id: "dark", bg: "bg-zinc-950", card: "bg-zinc-900 border-white/5", text: "text-white", sub: "text-zinc-400" },
  { id: "midnight", bg: "bg-[#0f172a]", card: "bg-[#1e293b] border-blue-500/10", text: "text-white", sub: "text-blue-300/60" },
  { id: "forest", bg: "bg-[#052e16]", card: "bg-[#14532d] border-green-500/10", text: "text-white", sub: "text-green-300/60" },
  { id: "sunset", bg: "bg-[#1c1917]", card: "bg-[#292524] border-orange-500/10", text: "text-white", sub: "text-orange-300/60" },
];

export function App() {
  const [name, setName] = useState("@yourname");
  const [bio, setBio] = useState("Creator, builder, dreamer. Making things people love.");
  const [avatar, setAvatar] = useState("🚀");
  const [themeId, setThemeId] = useState("dark");
  const [links, setLinks] = useState([
    { id: 1, title: "My Website", url: "https://example.com", emoji: "🌐" },
    { id: 2, title: "Latest Project", url: "https://example.com/project", emoji: "⚡" },
    { id: 3, title: "Newsletter", url: "https://example.com/newsletter", emoji: "📧" },
    { id: 4, title: "Twitter / X", url: "https://x.com", emoji: "𝕏" },
    { id: 5, title: "GitHub", url: "https://github.com", emoji: "🐙" },
  ]);
  const [editing, setEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEmoji, setNewEmoji] = useState("🔗");

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];

  const addLink = useCallback(() => {
    if (!newTitle.trim() || !newUrl.trim()) return;
    setLinks((prev) => [...prev, { id: nextId++, title: newTitle.trim(), url: newUrl.trim(), emoji: newEmoji || "🔗" }]);
    setNewTitle(""); setNewUrl(""); setNewEmoji("🔗");
  }, [newTitle, newUrl, newEmoji]);

  const removeLink = useCallback((id) => { setLinks((prev) => prev.filter((l) => l.id !== id)); }, []);

  const moveLink = useCallback((id, dir) => {
    setLinks((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }, []);

  return (
    <div className={"min-h-screen flex items-center justify-center p-4 " + theme.bg}>
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-3 gap-2">
          <button onClick={() => setEditing((e) => !e)} className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-all " + (editing ? "bg-violet-600 text-white" : "bg-white/5 " + theme.sub)}>
            {editing ? "Done" : "Edit"}
          </button>
          {editing && (
            <div className="flex gap-1">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => setThemeId(t.id)} className={"h-6 w-6 rounded-full border-2 transition-all " + t.bg + (themeId === t.id ? " border-white" : " border-transparent")} />
              ))}
            </div>
          )}
        </div>

        <div className="text-center mb-6">
          {editing ? (
            <input value={avatar} onChange={(e) => setAvatar(e.target.value)} className="text-5xl bg-transparent text-center w-16 mx-auto outline-none mb-2 block" maxLength={2} />
          ) : (
            <div className="text-5xl mb-2">{avatar}</div>
          )}
          {editing ? (
            <>
              <input value={name} onChange={(e) => setName(e.target.value)} className={"text-lg font-bold bg-transparent text-center outline-none w-full " + theme.text} />
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} className={"text-sm bg-transparent text-center outline-none w-full resize-none mt-1 " + theme.sub} rows={2} />
            </>
          ) : (
            <>
              <h1 className={"text-lg font-bold " + theme.text}>{name}</h1>
              <p className={"text-sm mt-1 " + theme.sub}>{bio}</p>
            </>
          )}
        </div>

        <div className="space-y-2.5 mb-5">
          {links.map((link) => (
            <div key={link.id} className="relative group">
              {editing && (
                <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100">
                  <button onClick={() => moveLink(link.id, -1)} className={"text-xs " + theme.sub}>▲</button>
                  <button onClick={() => moveLink(link.id, 1)} className={"text-xs " + theme.sub}>▼</button>
                </div>
              )}
              <a
                href={editing ? undefined : link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={"flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-all hover:scale-[1.02] " + theme.card}
              >
                <span className="text-lg">{link.emoji}</span>
                <span className={"flex-1 text-sm font-medium " + theme.text}>{link.title}</span>
                {editing ? (
                  <button onClick={(e) => { e.preventDefault(); removeLink(link.id); }} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                ) : (
                  <ExternalLink size={14} className={theme.sub} />
                )}
              </a>
            </div>
          ))}
        </div>

        {editing && (
          <div className={"rounded-2xl border p-4 " + theme.card}>
            <h3 className={"text-xs font-medium mb-2 " + theme.sub}>Add Link</h3>
            <div className="flex gap-2 mb-2">
              <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} className="w-10 rounded-lg bg-white/5 border border-white/5 px-2 py-2 text-center text-sm outline-none" maxLength={2} />
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title" className={"flex-1 rounded-lg bg-white/5 border border-white/5 px-3 py-2 text-sm placeholder-zinc-600 outline-none " + theme.text} />
            </div>
            <div className="flex gap-2">
              <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="URL" className={"flex-1 rounded-lg bg-white/5 border border-white/5 px-3 py-2 text-sm placeholder-zinc-600 outline-none " + theme.text} />
              <button onClick={addLink} className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white font-medium hover:bg-violet-500 transition-colors"><Plus size={15} /></button>
            </div>
          </div>
        )}

        <p className={"text-center text-[10px] mt-6 " + theme.sub}>Made with Beomz</p>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
