import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Search, Star, Phone, Mail, User, X } from "lucide-react";

let nextId = 20;

const SAMPLE = [
  { id: 1, name: "Alex Rivera", phone: "+1 555-0101", email: "alex@email.com", favorite: true },
  { id: 2, name: "Casey Kim", phone: "+1 555-0202", email: "casey@email.com", favorite: false },
  { id: 3, name: "Jordan Lee", phone: "+1 555-0303", email: "jordan@email.com", favorite: true },
  { id: 4, name: "Morgan Park", phone: "+1 555-0404", email: "morgan@email.com", favorite: false },
  { id: 5, name: "Sarah Chen", phone: "+1 555-0505", email: "sarah@email.com", favorite: false },
  { id: 6, name: "Taylor Wu", phone: "+1 555-0606", email: "taylor@email.com", favorite: true },
];

export function App() {
  const [contacts, setContacts] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [showFavs, setShowFavs] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    let list = contacts;
    if (showFavs) list = list.filter((c) => c.favorite);
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, search, showFavs]);

  const grouped = useMemo(() => {
    const map = {};
    for (const c of filtered) { const letter = c.name[0]?.toUpperCase() || "#"; (map[letter] ??= []).push(c); }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const addContact = useCallback(() => {
    if (!form.name.trim()) return;
    setContacts((prev) => [...prev, { id: nextId++, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), favorite: false }]);
    setForm({ name: "", phone: "", email: "" }); setAdding(false);
  }, [form]);

  const deleteContact = useCallback((id) => { setContacts((prev) => prev.filter((c) => c.id !== id)); if (selected === id) setSelected(null); }, [selected]);
  const toggleFavorite = useCallback((id) => { setContacts((prev) => prev.map((c) => c.id === id ? { ...c, favorite: !c.favorite } : c)); }, []);

  const detail = contacts.find((c) => c.id === selected);
  const initials = (name) => name.split(" ").slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><User size={20} /> Contacts</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setShowFavs(false)} className={"rounded-lg px-3 py-1 text-xs font-medium transition-all " + (!showFavs ? "bg-blue-600 text-white" : "bg-zinc-900 text-zinc-500")}>All ({contacts.length})</button>
          <button onClick={() => setShowFavs(true)} className={"rounded-lg px-3 py-1 text-xs font-medium transition-all " + (showFavs ? "bg-amber-600 text-white" : "bg-zinc-900 text-zinc-500")}>Favorites ({contacts.filter((c) => c.favorite).length})</button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Contact</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-3" />
            <button onClick={addContact} className="w-full rounded-xl bg-blue-600 py-2.5 text-white text-sm font-medium">Save Contact</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-400">{initials(detail.name)}</div>
                <div>
                  <h2 className="text-sm font-semibold text-white">{detail.name}</h2>
                  <button onClick={() => toggleFavorite(detail.id)} className={detail.favorite ? "text-amber-400" : "text-zinc-600"}>
                    <Star size={14} fill={detail.favorite ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            {detail.phone && <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2"><Phone size={14} /> {detail.phone}</div>}
            {detail.email && <div className="flex items-center gap-2 text-sm text-zinc-400 mb-4"><Mail size={14} /> {detail.email}</div>}
            <button onClick={() => deleteContact(detail.id)} className="text-xs text-red-400 hover:text-red-300">Delete contact</button>
          </div>
        ) : (
          <div>
            {grouped.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No contacts found</p>}
            {grouped.map(([letter, list]) => (
              <div key={letter} className="mb-3">
                <div className="sticky top-0 bg-zinc-950 py-1 z-10">
                  <span className="text-xs font-bold text-blue-400">{letter}</span>
                </div>
                <div className="space-y-1">
                  {list.map((c) => (
                    <button key={c.id} onClick={() => { setSelected(c.id); setAdding(false); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5 hover:border-white/10 transition-colors">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400 flex-shrink-0">{initials(c.name)}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white">{c.name}</span>
                        <p className="text-xs text-zinc-500 truncate">{c.phone || c.email}</p>
                      </div>
                      {c.favorite && <Star size={12} className="text-amber-400 flex-shrink-0" fill="currentColor" />}
                    </button>
                  ))}
                </div>
              </div>
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
