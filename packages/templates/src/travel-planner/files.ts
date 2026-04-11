import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, MapPin, Luggage, DollarSign, Calendar, X, Check } from "lucide-react";

let nextId = 10;

export function App() {
  const [tab, setTab] = useState("itinerary");
  const [tripName, setTripName] = useState("Summer Vacation");
  const [days, setDays] = useState([
    { id: 1, label: "Day 1", items: [{ id: 2, text: "Arrive at hotel, check in", time: "14:00" }, { id: 3, text: "Explore old town", time: "16:00" }] },
    { id: 4, label: "Day 2", items: [{ id: 5, text: "Beach morning", time: "09:00" }, { id: 6, text: "Lunch at harbor", time: "12:30" }, { id: 7, text: "Museum visit", time: "15:00" }] },
  ]);
  const [packing, setPacking] = useState([
    { id: 1, text: "Passport", packed: true }, { id: 2, text: "Sunscreen", packed: false },
    { id: 3, text: "Charger", packed: true }, { id: 4, text: "Swimsuit", packed: false },
    { id: 5, text: "Camera", packed: false },
  ]);
  const [expenses, setExpenses] = useState([
    { id: 1, item: "Flights", amount: 450 }, { id: 2, item: "Hotel (3 nights)", amount: 360 },
    { id: 3, item: "Car rental", amount: 120 },
  ]);
  const [addingDay, setAddingDay] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [addingToDayId, setAddingToDayId] = useState(null);
  const [newPacking, setNewPacking] = useState("");
  const [newExpenseItem, setNewExpenseItem] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");

  const addDay = useCallback(() => {
    setDays((prev) => [...prev, { id: nextId++, label: "Day " + (prev.length + 1), items: [] }]);
    setAddingDay(false);
  }, []);

  const addItemToDay = useCallback((dayId) => {
    if (!newItem.trim()) return;
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, items: [...d.items, { id: nextId++, text: newItem.trim(), time: "" }] } : d));
    setNewItem("");
    setAddingToDayId(null);
  }, [newItem]);

  const deleteDay = useCallback((dayId) => { setDays((prev) => prev.filter((d) => d.id !== dayId)); }, []);
  const deleteItem = useCallback((dayId, itemId) => { setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d)); }, []);

  const addPackingItem = useCallback(() => {
    if (!newPacking.trim()) return;
    setPacking((prev) => [...prev, { id: nextId++, text: newPacking.trim(), packed: false }]);
    setNewPacking("");
  }, [newPacking]);
  const togglePacked = useCallback((id) => { setPacking((prev) => prev.map((p) => p.id === id ? { ...p, packed: !p.packed } : p)); }, []);
  const deletePackingItem = useCallback((id) => { setPacking((prev) => prev.filter((p) => p.id !== id)); }, []);

  const addExpense = useCallback(() => {
    const amt = parseFloat(newExpenseAmount);
    if (!newExpenseItem.trim() || !amt) return;
    setExpenses((prev) => [...prev, { id: nextId++, item: newExpenseItem.trim(), amount: amt }]);
    setNewExpenseItem("");
    setNewExpenseAmount("");
  }, [newExpenseItem, newExpenseAmount]);
  const deleteExpense = useCallback((id) => { setExpenses((prev) => prev.filter((e) => e.id !== id)); }, []);

  const totalBudget = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const packedCount = packing.filter((p) => p.packed).length;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-1 flex items-center gap-2"><MapPin size={20} /> {tripName}</h1>
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-5 mt-3">
          {[{ k: "itinerary", icon: Calendar }, { k: "packing", icon: Luggage }, { k: "budget", icon: DollarSign }].map(({ k, icon: Icon }) => (
            <button key={k} onClick={() => setTab(k)} className={"flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium capitalize transition-all " + (tab === k ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}>
              <Icon size={13} />{k}
            </button>
          ))}
        </div>

        {tab === "itinerary" && (
          <div className="space-y-3">
            {days.map((day) => (
              <div key={day.id} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-white">{day.label}</span>
                  <button onClick={() => deleteDay(day.id)} className="text-zinc-700 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
                <div className="space-y-1.5 mb-2">
                  {day.items.map((item) => (
                    <div key={item.id} className="group flex items-center gap-2">
                      <span className="text-xs text-sky-400 w-10">{item.time || "—"}</span>
                      <span className="flex-1 text-sm text-zinc-300">{item.text}</span>
                      <button onClick={() => deleteItem(day.id, item.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={12} /></button>
                    </div>
                  ))}
                </div>
                {addingToDayId === day.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); addItemToDay(day.id); }} className="flex gap-2">
                    <input autoFocus value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Activity..." className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none" />
                    <button type="submit" className="text-xs text-sky-400">Add</button>
                  </form>
                ) : (
                  <button onClick={() => setAddingToDayId(day.id)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400"><Plus size={12} /> Add activity</button>
                )}
              </div>
            ))}
            <button onClick={addDay} className="w-full rounded-xl border border-dashed border-zinc-800 py-3 text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors flex items-center justify-center gap-1">
              <Plus size={14} /> Add Day
            </button>
          </div>
        )}

        {tab === "packing" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500">{packedCount}/{packing.length} packed</span>
              <div className="w-24 h-1.5 bg-zinc-800 rounded-full"><div className="h-1.5 bg-sky-500 rounded-full transition-all" style={{ width: (packing.length > 0 ? (packedCount / packing.length) * 100 : 0) + "%" }} /></div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addPackingItem(); }} className="flex gap-2 mb-3">
              <input value={newPacking} onChange={(e) => setNewPacking(e.target.value)} placeholder="Add item..." className="flex-1 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white font-medium"><Plus size={15} /></button>
            </form>
            <div className="space-y-1.5">
              {packing.map((item) => (
                <div key={item.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5">
                  <button onClick={() => togglePacked(item.id)} className={"flex h-5 w-5 items-center justify-center rounded flex-shrink-0 transition-all " + (item.packed ? "bg-sky-600 text-white" : "border border-zinc-700")}>
                    {item.packed && <Check size={11} />}
                  </button>
                  <span className={"flex-1 text-sm " + (item.packed ? "text-zinc-600 line-through" : "text-white")}>{item.text}</span>
                  <button onClick={() => deletePackingItem(item.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "budget" && (
          <div>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4 text-center">
              <span className="text-xs text-zinc-500">Total Budget</span>
              <p className="text-3xl font-bold text-white mt-1">\${totalBudget.toFixed(2)}</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addExpense(); }} className="flex gap-2 mb-3">
              <input value={newExpenseItem} onChange={(e) => setNewExpenseItem(e.target.value)} placeholder="Item" className="flex-1 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" value={newExpenseAmount} onChange={(e) => setNewExpenseAmount(e.target.value)} placeholder="$" className="w-20 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-sky-600 px-3 py-2 text-white"><Plus size={15} /></button>
            </form>
            <div className="space-y-1.5">
              {expenses.map((e) => (
                <div key={e.id} className="group flex items-center justify-between rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5">
                  <span className="text-sm text-zinc-300">{e.item}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">\${e.amount.toFixed(2)}</span>
                    <button onClick={() => deleteExpense(e.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
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
