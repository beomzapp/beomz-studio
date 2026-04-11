import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, X, GripVertical } from "lucide-react";

let nextId = 1;
const INITIAL_COLUMNS = [
  { id: "todo", title: "To Do", color: "bg-zinc-500" },
  { id: "in-progress", title: "In Progress", color: "bg-amber-500" },
  { id: "done", title: "Done", color: "bg-green-500" },
];

export function App() {
  const [cards, setCards] = useState([]);
  const [adding, setAdding] = useState(null);
  const [newText, setNewText] = useState("");

  const addCard = useCallback((columnId) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    setCards((prev) => [...prev, { id: nextId++, text: trimmed, columnId }]);
    setNewText("");
    setAdding(null);
  }, [newText]);

  const deleteCard = useCallback((id) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const moveCard = useCallback((id, direction) => {
    setCards((prev) => prev.map((card) => {
      if (card.id !== id) return card;
      const colIds = INITIAL_COLUMNS.map((c) => c.id);
      const idx = colIds.indexOf(card.columnId);
      const next = idx + direction;
      if (next < 0 || next >= colIds.length) return card;
      return { ...card, columnId: colIds[next] };
    }));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-xl font-semibold text-white mb-5">Kanban Board</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {INITIAL_COLUMNS.map((col) => {
            const colCards = cards.filter((c) => c.columnId === col.id);
            return (
              <div key={col.id} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className={"h-2.5 w-2.5 rounded-full " + col.color} />
                  <h2 className="text-sm font-medium text-white">{col.title}</h2>
                  <span className="text-xs text-zinc-600 ml-auto">{colCards.length}</span>
                </div>
                <div className="space-y-2 mb-3 min-h-[80px]">
                  {colCards.map((card) => (
                    <div key={card.id} className="group rounded-xl bg-zinc-800/80 border border-white/5 p-3 transition-colors hover:border-white/10">
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-zinc-700 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-zinc-200 flex-1">{card.text}</p>
                        <button onClick={() => deleteCard(card.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 flex-shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-1 mt-2 ml-5">
                        {col.id !== "todo" && (
                          <button onClick={() => moveCard(card.id, -1)} className="text-[10px] text-zinc-600 hover:text-zinc-300 bg-zinc-700/50 rounded px-1.5 py-0.5 transition-colors">
                            ← Move
                          </button>
                        )}
                        {col.id !== "done" && (
                          <button onClick={() => moveCard(card.id, 1)} className="text-[10px] text-zinc-600 hover:text-zinc-300 bg-zinc-700/50 rounded px-1.5 py-0.5 transition-colors">
                            Move →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {adding === col.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); addCard(col.id); }} className="space-y-2">
                    <textarea
                      autoFocus
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      placeholder="Card title..."
                      rows={2}
                      className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors">
                        Add
                      </button>
                      <button type="button" onClick={() => { setAdding(null); setNewText(""); }} className="text-xs text-zinc-500 hover:text-zinc-300">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setAdding(col.id)}
                    className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors w-full rounded-lg py-2 justify-center hover:bg-zinc-800/60"
                  >
                    <Plus size={14} /> Add card
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
