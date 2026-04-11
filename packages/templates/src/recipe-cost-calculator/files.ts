import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Calculator, Users } from "lucide-react";

let nextId = 10;

export function App() {
  const [recipeName, setRecipeName] = useState("Homemade Pasta");
  const [servings, setServings] = useState(4);
  const [ingredients, setIngredients] = useState([
    { id: 1, name: "Flour (2 cups)", price: 0.80 },
    { id: 2, name: "Eggs (3 large)", price: 1.20 },
    { id: 3, name: "Olive oil (2 tbsp)", price: 0.40 },
    { id: 4, name: "Salt (1 tsp)", price: 0.05 },
    { id: 5, name: "Parmesan (1/2 cup)", price: 2.50 },
    { id: 6, name: "Garlic (3 cloves)", price: 0.30 },
    { id: 7, name: "Butter (2 tbsp)", price: 0.45 },
  ]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const totalCost = useMemo(() => ingredients.reduce((s, i) => s + i.price, 0), [ingredients]);
  const perServing = servings > 0 ? totalCost / servings : 0;

  const addIngredient = useCallback(() => {
    const price = parseFloat(newPrice);
    if (!newName.trim() || isNaN(price)) return;
    setIngredients((prev) => [...prev, { id: nextId++, name: newName.trim(), price }]);
    setNewName(""); setNewPrice("");
  }, [newName, newPrice]);

  const removeIngredient = useCallback((id) => {
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updatePrice = useCallback((id, price) => {
    setIngredients((prev) => prev.map((i) => i.id === id ? { ...i, price: parseFloat(price) || 0 } : i));
  }, []);

  const fmt = (n) => "$" + n.toFixed(2);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Calculator size={20} /> Recipe Cost</h1>

          <div className="mb-4">
            <input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} className="w-full bg-transparent text-lg font-medium text-white outline-none placeholder-zinc-600" placeholder="Recipe name" />
          </div>

          <div className="flex items-center gap-3 mb-5">
            <Users size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500">Servings:</span>
            <button onClick={() => setServings((s) => Math.max(1, s - 1))} className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 flex items-center justify-center">-</button>
            <span className="text-sm font-medium text-white w-6 text-center">{servings}</span>
            <button onClick={() => setServings((s) => s + 1)} className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 flex items-center justify-center">+</button>
          </div>

          <div className="space-y-1.5 mb-4">
            {ingredients.map((ing) => (
              <div key={ing.id} className="group flex items-center gap-3 rounded-xl bg-zinc-800/60 px-3 py-2.5">
                <span className="flex-1 text-sm text-zinc-300">{ing.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-zinc-500">$</span>
                  <input type="number" step="0.01" value={ing.price} onChange={(e) => updatePrice(ing.id, e.target.value)} className="w-16 bg-transparent text-sm text-white outline-none text-right" />
                </div>
                <button onClick={() => removeIngredient(ing.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); addIngredient(); }} className="flex gap-2 mb-5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ingredient + amount" className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
            <input type="number" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="$" className="w-16 rounded-xl bg-zinc-800 border border-white/5 px-2 py-2.5 text-sm text-white placeholder-zinc-600 outline-none text-center" />
            <button type="submit" className="rounded-xl bg-orange-600 px-3 py-2.5 text-white"><Plus size={16} /></button>
          </form>

          <div className="rounded-2xl bg-zinc-800/60 p-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-400">Total Cost</span>
              <span className="text-lg font-bold text-white">{fmt(totalCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">Per Serving ({servings})</span>
              <span className="text-lg font-bold text-orange-400">{fmt(perServing)}</span>
            </div>
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
