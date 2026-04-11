import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Search, X, User, Phone, Mail, Tag, MessageSquare } from "lucide-react";

let nextId = 10;
const TAGS = ["Friend", "Colleague", "Client", "Family", "Mentor", "Lead"];
const SAMPLE = [
  { id: 1, name: "Sarah Chen", email: "sarah@company.co", phone: "+1 555-0101", tag: "Client", notes: "Met at SaaStr, interested in enterprise plan", lastContact: "2 days ago" },
  { id: 2, name: "Alex Rivera", email: "alex@startup.io", phone: "+1 555-0202", tag: "Colleague", notes: "Co-working buddy, great at frontend", lastContact: "1 week ago" },
  { id: 3, name: "Jordan Lee", email: "jordan@agency.com", phone: "+1 555-0303", tag: "Lead", notes: "Referred by Sarah, schedule demo", lastContact: "3 days ago" },
  { id: 4, name: "Morgan Park", email: "morgan@freelance.co", phone: "", tag: "Friend", notes: "Coffee every other Friday", lastContact: "2 weeks ago" },
];

export function App() {
  const [contacts, setContacts] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", tag: "Friend", notes: "" });

  const filtered = useMemo(() => {
    let list = contacts;
    if (tagFilter !== "All") list = list.filter((c) => c.tag === tagFilter);
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [contacts, search, tagFilter]);

  const addContact = useCallback(() => {
    if (!form.name.trim()) return;
    setContacts((prev) => [...prev, { ...form, id: nextId++, name: form.name.trim(), lastContact: "Just now" }]);
    setForm({ name: "", email: "", phone: "", tag: "Friend", notes: "" });
    setAdding(false);
  }, [form]);

  const deleteContact = useCallback((id) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    if (selected === id) setSelected(null);
  }, [selected]);

  const detail = contacts.find((c) => c.id === selected);
  const tagColor = (t) => t === "Client" ? "bg-blue-600/20 text-blue-400" : t === "Lead" ? "bg-amber-600/20 text-amber-400" : t === "Colleague" ? "bg-purple-600/20 text-purple-400" : t === "Family" ? "bg-red-600/20 text-red-400" : t === "Mentor" ? "bg-green-600/20 text-green-400" : "bg-zinc-700 text-zinc-300";

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><User size={20} /> Contacts</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {["All", ...TAGS].map((t) => (
            <button key={t} onClick={() => setTagFilter(t)} className={"rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all " + (tagFilter === t ? "bg-purple-600 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              {t}
            </button>
          ))}
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Contact</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none" />
            </div>
            <button onClick={addContact} className="w-full mt-3 rounded-xl bg-purple-600 py-2.5 text-white text-sm font-medium hover:bg-purple-500 transition-colors">Save Contact</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-400">{detail.name.split(" ").map((n) => n[0]).join("")}</div>
                <div>
                  <h2 className="text-sm font-semibold text-white">{detail.name}</h2>
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + tagColor(detail.tag)}>{detail.tag}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            {detail.email && <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1.5"><Mail size={13} /> {detail.email}</div>}
            {detail.phone && <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1.5"><Phone size={13} /> {detail.phone}</div>}
            {detail.notes && <div className="flex items-start gap-2 text-sm text-zinc-400 mt-3"><MessageSquare size={13} className="mt-0.5 flex-shrink-0" /> {detail.notes}</div>}
            <p className="text-xs text-zinc-600 mt-3">Last contact: {detail.lastContact}</p>
            <button onClick={() => deleteContact(detail.id)} className="mt-4 text-xs text-red-400 hover:text-red-300">Delete contact</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-8">No contacts found</p>}
            {filtered.map((c) => (
              <button key={c.id} onClick={() => { setSelected(c.id); setAdding(false); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400 flex-shrink-0">{c.name.split(" ").map((n) => n[0]).join("")}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{c.name}</span>
                  <p className="text-xs text-zinc-500 truncate">{c.email}</p>
                </div>
                <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + tagColor(c.tag)}>{c.tag}</span>
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
