import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Heart, Search, X, ChefHat } from "lucide-react";

let nextId = 10;
const SAMPLE = [
  { id: 1, name: "Pasta Carbonara", ingredients: ["Spaghetti", "Eggs", "Pecorino", "Guanciale", "Black pepper"], steps: ["Boil pasta al dente", "Fry guanciale until crispy", "Mix eggs with cheese", "Toss hot pasta with egg mix and guanciale"], favorite: true },
  { id: 2, name: "Avocado Toast", ingredients: ["Sourdough bread", "Avocado", "Lemon", "Red pepper flakes", "Salt"], steps: ["Toast the bread", "Mash avocado with lemon and salt", "Spread on toast", "Top with red pepper flakes"], favorite: false },
  { id: 3, name: "Chicken Stir Fry", ingredients: ["Chicken breast", "Bell peppers", "Soy sauce", "Garlic", "Ginger", "Rice"], steps: ["Cook rice", "Slice chicken and veggies", "Stir fry chicken until golden", "Add veggies and sauce", "Serve over rice"], favorite: false },
];

export function App() {
  const [recipes, setRecipes] = useState(SAMPLE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIngredients, setNewIngredients] = useState("");
  const [newSteps, setNewSteps] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, search]);

  const toggleFav = useCallback((id) => {
    setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, favorite: !r.favorite } : r));
  }, []);

  const addRecipe = useCallback(() => {
    if (!newName.trim()) return;
    setRecipes((prev) => [...prev, {
      id: nextId++,
      name: newName.trim(),
      ingredients: newIngredients.split("\\n").map((s) => s.trim()).filter(Boolean),
      steps: newSteps.split("\\n").map((s) => s.trim()).filter(Boolean),
      favorite: false,
    }]);
    setNewName("");
    setNewIngredients("");
    setNewSteps("");
    setAdding(false);
  }, [newName, newIngredients, newSteps]);

  const deleteRecipe = useCallback((id) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    if (selected === id) setSelected(null);
  }, [selected]);

  const detail = recipes.find((r) => r.id === selected);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><ChefHat size={20} /> Recipes</h1>
          <button onClick={() => { setAdding(true); setSelected(null); }} className="flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipes..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Recipe</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Recipe name" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <textarea placeholder="Ingredients (one per line)" value={newIngredients} onChange={(e) => setNewIngredients(e.target.value)} rows={3} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none mb-2" />
            <textarea placeholder="Steps (one per line)" value={newSteps} onChange={(e) => setNewSteps(e.target.value)} rows={3} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none mb-3" />
            <button onClick={addRecipe} className="w-full rounded-xl bg-orange-600 py-2.5 text-white text-sm font-medium hover:bg-orange-500 transition-colors">Save Recipe</button>
          </div>
        )}

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{detail.name}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleFav(detail.id)} className={detail.favorite ? "text-red-400" : "text-zinc-600 hover:text-red-400"}><Heart size={18} fill={detail.favorite ? "currentColor" : "none"} /></button>
                <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
            </div>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Ingredients</h3>
            <ul className="space-y-1 mb-4">{detail.ingredients.map((ing, i) => <li key={i} className="text-sm text-zinc-300 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" />{ing}</li>)}</ul>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Steps</h3>
            <ol className="space-y-2">{detail.steps.map((step, i) => <li key={i} className="flex gap-3 text-sm"><span className="text-orange-400 font-medium flex-shrink-0">{i + 1}.</span><span className="text-zinc-300">{step}</span></li>)}</ol>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.length === 0 && <p className="text-sm text-zinc-600 col-span-2 text-center py-8">No recipes found</p>}
            {filtered.map((r) => (
              <button key={r.id} onClick={() => { setSelected(r.id); setAdding(false); }} className="text-left rounded-2xl bg-zinc-900 border border-white/5 p-4 hover:border-white/10 transition-colors group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">{r.name}</span>
                  <Heart size={14} className={r.favorite ? "text-red-400" : "text-zinc-700"} fill={r.favorite ? "currentColor" : "none"} />
                </div>
                <p className="text-xs text-zinc-500">{r.ingredients.length} ingredients · {r.steps.length} steps</p>
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
