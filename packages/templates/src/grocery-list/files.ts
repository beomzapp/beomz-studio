import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Check, Circle, ShoppingCart, Search } from "lucide-react";

let nextId = 20;
const AISLES = ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Pantry", "Beverages", "Household", "Other"];

const SAMPLE = [
  { id: 1, name: "Bananas", qty: "1 bunch", aisle: "Produce", checked: false },
  { id: 2, name: "Milk (2%)", qty: "1 gallon", aisle: "Dairy", checked: false },
  { id: 3, name: "Chicken breast", qty: "2 lbs", aisle: "Meat", checked: true },
  { id: 4, name: "Sourdough bread", qty: "1 loaf", aisle: "Bakery", checked: false },
  { id: 5, name: "Frozen peas", qty: "1 bag", aisle: "Frozen", checked: false },
  { id: 6, name: "Olive oil", qty: "1 bottle", aisle: "Pantry", checked: true },
  { id: 7, name: "Coffee beans", qty: "12 oz", aisle: "Beverages", checked: false },
  { id: 8, name: "Paper towels", qty: "1 pack", aisle: "Household", checked: false },
];

export function App() {
  const [items, setItems] = useState(SAMPLE);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newAisle, setNewAisle] = useState("Produce");
  const [search, setSearch] = useState("");

  const addItem = useCallback(() => {
    if (!newName.trim()) return;
    setItems((prev) => [...prev, { id: nextId++, name: newName.trim(), qty: newQty.trim() || "1", aisle: newAisle, checked: false }]);
    setNewName(""); setNewQty("");
  }, [newName, newQty, newAisle]);

  const toggleItem = useCallback((id) => { setItems((prev) => prev.map((i) => i.id === id ? { ...i, checked: !i.checked } : i)); }, []);
  const removeItem = useCallback((id) => { setItems((prev) => prev.filter((i) => i.id !== id)); }, []);
  const clearChecked = useCallback(() => { setItems((prev) => prev.filter((i) => !i.checked)); }, []);

  const grouped = useMemo(() => {
    const filtered = search ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())) : items;
    const map = {};
    for (const item of filtered) {
      (map[item.aisle] ??= []).push(item);
    }
    return AISLES.filter((a) => map[a]).map((a) => ({ aisle: a, items: map[a] }));
  }, [items, search]);

  const total = items.length;
  const checked = items.filter((i) => i.checked).length;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><ShoppingCart size={20} /> Grocery List</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{checked}/{total}</span>
            {checked > 0 && <button onClick={clearChecked} className="text-xs text-red-400 hover:text-red-300">Clear done</button>}
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
          <div className="flex gap-2 mb-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Item name" className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
            <input value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="Qty" className="w-20 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
          </div>
          <div className="flex gap-2">
            <select value={newAisle} onChange={(e) => setNewAisle(e.target.value)} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none">
              {AISLES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="submit" className="flex items-center gap-1 rounded-xl bg-green-600 px-4 py-2 text-sm text-white font-medium hover:bg-green-500 transition-colors">
              <Plus size={15} /> Add
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {grouped.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No items</p>}
          {grouped.map(({ aisle, items: aisleItems }) => (
            <div key={aisle}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 px-1">{aisle}</h3>
              <div className="space-y-1">
                {aisleItems.map((item) => (
                  <div key={item.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2.5">
                    <button onClick={() => toggleItem(item.id)} className="flex-shrink-0">
                      {item.checked ? <Check size={16} className="text-green-400" /> : <Circle size={16} className="text-zinc-600" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={"text-sm " + (item.checked ? "text-zinc-600 line-through" : "text-white")}>{item.name}</span>
                    </div>
                    <span className="text-xs text-zinc-500">{item.qty}</span>
                    <button onClick={() => removeItem(item.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                ))}
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
