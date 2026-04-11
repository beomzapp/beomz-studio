import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, X, ShoppingCart, UtensilsCrossed } from "lucide-react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS = ["Breakfast", "Lunch", "Dinner"];

export function App() {
  const [plan, setPlan] = useState({});
  const [editing, setEditing] = useState(null);
  const [input, setInput] = useState("");
  const [showGrocery, setShowGrocery] = useState(false);

  const setMeal = useCallback((day, meal, value) => {
    const key = day + ":" + meal;
    setPlan((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setEditing(null);
    setInput("");
  }, []);

  const groceryList = useMemo(() => {
    const items = new Set();
    Object.values(plan).forEach((meal) => {
      if (typeof meal === "string") items.add(meal);
    });
    return Array.from(items).sort();
  }, [plan]);

  const filledCount = Object.keys(plan).length;
  const totalSlots = DAYS.length * MEALS.length;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><UtensilsCrossed size={20} /> Meal Planner</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{filledCount}/{totalSlots} planned</span>
            <button onClick={() => setShowGrocery((s) => !s)} className={"flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " + (showGrocery ? "bg-orange-600 text-white" : "bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white")}>
              <ShoppingCart size={13} /> Grocery List
            </button>
          </div>
        </div>

        {showGrocery && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
            <h2 className="text-sm font-medium text-white mb-3">Grocery List ({groceryList.length} items)</h2>
            {groceryList.length === 0 ? (
              <p className="text-sm text-zinc-600">Plan some meals to generate a grocery list</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {groceryList.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg px-3 py-1.5 bg-zinc-800/60 text-sm text-zinc-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" />{item}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-8 gap-2 mb-2">
              <div />
              {DAYS.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-zinc-400">{day.slice(0, 3)}</div>
              ))}
            </div>
            {MEALS.map((meal) => (
              <div key={meal} className="grid grid-cols-8 gap-2 mb-2">
                <div className="flex items-center text-xs font-medium text-zinc-500 pr-2">{meal}</div>
                {DAYS.map((day) => {
                  const key = day + ":" + meal;
                  const value = plan[key];
                  const isEditing = editing === key;
                  return (
                    <div key={key} className="min-h-[56px]">
                      {isEditing ? (
                        <form onSubmit={(e) => { e.preventDefault(); setMeal(day, meal, input); }} className="h-full">
                          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} onBlur={() => { if (input.trim()) setMeal(day, meal, input); else setEditing(null); }} placeholder="Meal..." className="w-full h-full rounded-lg bg-zinc-800 border border-orange-500/40 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none" />
                        </form>
                      ) : value ? (
                        <div className="group relative h-full rounded-lg bg-zinc-800/60 border border-white/5 p-2 cursor-pointer hover:border-white/10" onClick={() => { setEditing(key); setInput(value); }}>
                          <span className="text-xs text-zinc-300 line-clamp-2">{value}</span>
                          <button onClick={(e) => { e.stopPropagation(); setMeal(day, meal, ""); }} className="absolute top-1 right-1 text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400">
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditing(key); setInput(""); }} className="w-full h-full rounded-lg border border-dashed border-zinc-800 flex items-center justify-center text-zinc-700 hover:border-zinc-600 hover:text-zinc-500 transition-colors">
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
