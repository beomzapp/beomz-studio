import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo, useCallback } = React;
import { Search, ShoppingCart, Plus, Minus, X, Star, Filter } from "lucide-react";

const PRODUCTS = [
  { id: 1, name: "Wireless Headphones", price: 79.99, rating: 4.5, category: "Electronics", image: "🎧", reviews: 234 },
  { id: 2, name: "Running Shoes", price: 129.99, rating: 4.8, category: "Sports", image: "👟", reviews: 187 },
  { id: 3, name: "Coffee Maker", price: 49.99, rating: 4.2, category: "Home", image: "☕", reviews: 312 },
  { id: 4, name: "Backpack", price: 59.99, rating: 4.6, category: "Accessories", image: "🎒", reviews: 156 },
  { id: 5, name: "Smart Watch", price: 199.99, rating: 4.4, category: "Electronics", image: "⌚", reviews: 421 },
  { id: 6, name: "Yoga Mat", price: 29.99, rating: 4.7, category: "Sports", image: "🧘", reviews: 98 },
  { id: 7, name: "Desk Lamp", price: 34.99, rating: 4.3, category: "Home", image: "💡", reviews: 67 },
  { id: 8, name: "Sunglasses", price: 89.99, rating: 4.1, category: "Accessories", image: "🕶️", reviews: 143 },
  { id: 9, name: "Bluetooth Speaker", price: 69.99, rating: 4.5, category: "Electronics", image: "🔊", reviews: 278 },
  { id: 10, name: "Water Bottle", price: 24.99, rating: 4.9, category: "Sports", image: "🧴", reviews: 89 },
  { id: 11, name: "Candle Set", price: 19.99, rating: 4.6, category: "Home", image: "🕯️", reviews: 54 },
  { id: 12, name: "Leather Wallet", price: 44.99, rating: 4.4, category: "Accessories", image: "👛", reviews: 201 },
];

const CATEGORIES = ["All", "Electronics", "Sports", "Home", "Accessories"];

export function App() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [sort, setSort] = useState("popular");

  const filtered = useMemo(() => {
    let list = PRODUCTS;
    if (category !== "All") list = list.filter((p) => p.category === category);
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (sort === "price-low") list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === "price-high") list = [...list].sort((a, b) => b.price - a.price);
    else if (sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [search, category, sort]);

  const addToCart = useCallback((id) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[id] > 1) next[id]--;
      else delete next[id];
      return next;
    });
  }, []);

  const cartItems = useMemo(() => {
    return Object.entries(cart).map(([id, qty]) => {
      const product = PRODUCTS.find((p) => p.id === parseInt(id));
      return { ...product, qty };
    }).filter(Boolean);
  }, [cart]);

  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.price * i.qty, 0), [cartItems]);
  const cartCount = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);

  const fmt = (n) => "$" + n.toFixed(2);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white">Product Catalog</h1>
          <button onClick={() => setShowCart((s) => !s)} className="relative flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-white/5 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 transition-colors">
            <ShoppingCart size={16} />
            {cartCount > 0 && <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">{cartCount}</span>}
          </button>
        </div>

        {showCart && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-white">Cart ({cartCount})</h2>
              <button onClick={() => setShowCart(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            {cartItems.length === 0 ? (
              <p className="text-sm text-zinc-600 py-4 text-center">Cart is empty</p>
            ) : (
              <>
                <div className="space-y-2 mb-3">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="text-xl">{item.image}</span>
                      <span className="flex-1 text-sm text-white">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => removeFromCart(item.id)} className="h-6 w-6 rounded bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 flex items-center justify-center"><Minus size={12} /></button>
                        <span className="text-sm text-white w-4 text-center">{item.qty}</span>
                        <button onClick={() => addToCart(item.id)} className="h-6 w-6 rounded bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 flex items-center justify-center"><Plus size={12} /></button>
                      </div>
                      <span className="text-sm text-zinc-400 w-16 text-right">{fmt(item.price * item.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/5 pt-3 flex justify-between">
                  <span className="text-sm text-zinc-400">Total</span>
                  <span className="text-lg font-bold text-white">{fmt(cartTotal)}</span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-xl bg-zinc-900 border border-white/5 px-3 py-2.5 text-xs text-white outline-none">
            <option value="popular">Most Popular</option>
            <option value="rating">Highest Rated</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
        </div>

        <div className="flex gap-1.5 mb-5 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={"rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all " + (category === c ? "bg-rose-600 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.length === 0 && <p className="col-span-full text-center text-sm text-zinc-600 py-8">No products found</p>}
          {filtered.map((p) => (
            <div key={p.id} className="rounded-2xl bg-zinc-900 border border-white/5 p-4 hover:border-white/10 transition-colors">
              <div className="text-4xl text-center mb-3 py-3">{p.image}</div>
              <h3 className="text-sm font-medium text-white truncate">{p.name}</h3>
              <div className="flex items-center gap-1 mt-1 mb-2">
                <Star size={11} className="text-amber-400" fill="currentColor" />
                <span className="text-xs text-zinc-400">{p.rating} ({p.reviews})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{fmt(p.price)}</span>
                <button onClick={() => addToCart(p.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-colors">
                  <Plus size={14} />
                </button>
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
