import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Copy, Check, Search, Code, X } from "lucide-react";

let nextId = 20;
const LANGUAGES = ["JavaScript", "TypeScript", "Python", "Go", "Rust", "CSS", "SQL", "Shell"];
const LANG_COLOR = { JavaScript: "bg-yellow-500", TypeScript: "bg-blue-500", Python: "bg-green-500", Go: "bg-cyan-500", Rust: "bg-orange-600", CSS: "bg-pink-500", SQL: "bg-indigo-500", Shell: "bg-zinc-500" };

const SAMPLE = [
  { id: 1, title: "Debounce function", language: "TypeScript", code: "function debounce<T extends (...args: any[]) => void>(\\n  fn: T,\\n  delay: number\\n): (...args: Parameters<T>) => void {\\n  let timer: ReturnType<typeof setTimeout>;\\n  return (...args) => {\\n    clearTimeout(timer);\\n    timer = setTimeout(() => fn(...args), delay);\\n  };\\n}" },
  { id: 2, title: "Fetch with retry", language: "JavaScript", code: "async function fetchWithRetry(url, retries = 3) {\\n  for (let i = 0; i < retries; i++) {\\n    try {\\n      const res = await fetch(url);\\n      if (res.ok) return res.json();\\n    } catch (e) {\\n      if (i === retries - 1) throw e;\\n    }\\n  }\\n}" },
  { id: 3, title: "Quick sort", language: "Python", code: "def quicksort(arr):\\n    if len(arr) <= 1:\\n        return arr\\n    pivot = arr[len(arr) // 2]\\n    left = [x for x in arr if x < pivot]\\n    middle = [x for x in arr if x == pivot]\\n    right = [x for x in arr if x > pivot]\\n    return quicksort(left) + middle + quicksort(right)" },
];

export function App() {
  const [snippets, setSnippets] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", language: "JavaScript", code: "" });
  const [copied, setCopied] = useState(null);

  const filtered = useMemo(() => {
    let list = snippets;
    if (langFilter !== "All") list = list.filter((s) => s.language === langFilter);
    if (search) list = list.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [snippets, search, langFilter]);

  const addSnippet = useCallback(() => {
    if (!form.title.trim() || !form.code.trim()) return;
    setSnippets((prev) => [{ id: nextId++, title: form.title.trim(), language: form.language, code: form.code }, ...prev]);
    setForm({ title: "", language: "JavaScript", code: "" }); setAdding(false);
  }, [form]);

  const deleteSnippet = useCallback((id) => { setSnippets((prev) => prev.filter((s) => s.id !== id)); if (selected === id) setSelected(null); }, [selected]);

  const copyCode = useCallback((code, id) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(id); setTimeout(() => setCopied(null), 1500);
  }, []);

  const detail = snippets.find((s) => s.id === selected);

  return (
    <div className="min-h-screen bg-[#060612] text-white p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold flex items-center gap-2"><Code size={20} className="text-purple-400" /> Snippets</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">
            <Plus size={14} /> New
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search snippets..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          <button onClick={() => setLangFilter("All")} className={"rounded-lg px-2.5 py-1 text-xs font-medium transition-all " + (langFilter === "All" ? "bg-purple-600 text-white" : "bg-zinc-900 text-zinc-500")}>All</button>
          {LANGUAGES.map((l) => (
            <button key={l} onClick={() => setLangFilter(l)} className={"rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all " + (langFilter === l ? "bg-purple-600 text-white" : "bg-zinc-900 text-zinc-500")}>
              {l}
            </button>
          ))}
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">New Snippet</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mb-2">
              <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
              <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className="rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <textarea placeholder="Paste your code here..." value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} rows={6} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none font-mono mb-3" />
            <button onClick={addSnippet} className="w-full rounded-xl bg-purple-600 py-2.5 text-white text-sm font-medium hover:bg-purple-500 transition-colors">Save Snippet</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium text-white " + (LANG_COLOR[detail.language] || "bg-zinc-600")}>{detail.language}</span>
                <h2 className="text-sm font-medium">{detail.title}</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={() => copyCode(detail.code, detail.id)} className="text-zinc-500 hover:text-white">
                  {copied === detail.id ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
                <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
              </div>
            </div>
            <pre className="rounded-xl bg-zinc-800/80 p-4 text-sm text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap">{detail.code}</pre>
            <button onClick={() => deleteSnippet(detail.id)} className="mt-3 text-xs text-red-400 hover:text-red-300">Delete snippet</button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-8">No snippets found</p>}
            {filtered.map((s) => (
              <button key={s.id} onClick={() => { setSelected(s.id); setAdding(false); }} className="w-full text-left rounded-xl bg-zinc-900 border border-white/5 p-4 hover:border-white/10 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium text-white " + (LANG_COLOR[s.language] || "bg-zinc-600")}>{s.language}</span>
                  <span className="text-sm font-medium">{s.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); copyCode(s.code, s.id); }} className="ml-auto text-zinc-600 hover:text-white">
                    {copied === s.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  </button>
                </div>
                <pre className="text-xs text-zinc-500 font-mono truncate">{s.code.split("\\n")[0]}</pre>
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
