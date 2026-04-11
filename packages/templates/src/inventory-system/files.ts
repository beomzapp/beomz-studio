import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Search, Package, AlertTriangle, Plus, X } from "lucide-react";

const CATEGORIES = ["All", "Electronics", "Furniture", "Supplies", "Food", "Clothing"];
const CAT_COLOR = { Electronics: "bg-blue-50 text-blue-600", Furniture: "bg-amber-50 text-amber-600", Supplies: "bg-green-50 text-green-600", Food: "bg-orange-50 text-orange-600", Clothing: "bg-purple-50 text-purple-600" };

const ITEMS = [
  { id: 1, name: "Wireless Keyboard", sku: "EL-1001", category: "Electronics", stock: 142, reorder: 50, price: 49.99 },
  { id: 2, name: "Office Chair Pro", sku: "FU-2001", category: "Furniture", stock: 23, reorder: 20, price: 289.99 },
  { id: 3, name: "A4 Paper (500 sheets)", sku: "SU-3001", category: "Supplies", stock: 8, reorder: 30, price: 12.99 },
  { id: 4, name: "USB-C Hub", sku: "EL-1002", category: "Electronics", stock: 67, reorder: 25, price: 34.99 },
  { id: 5, name: "Standing Desk", sku: "FU-2002", category: "Furniture", stock: 5, reorder: 10, price: 599.99 },
  { id: 6, name: "Coffee Beans 1kg", sku: "FO-4001", category: "Food", stock: 15, reorder: 20, price: 18.99 },
  { id: 7, name: "Monitor Stand", sku: "FU-2003", category: "Furniture", stock: 31, reorder: 15, price: 79.99 },
  { id: 8, name: "Sticky Notes Pack", sku: "SU-3002", category: "Supplies", stock: 200, reorder: 50, price: 4.99 },
  { id: 9, name: "Branded T-Shirt", sku: "CL-5001", category: "Clothing", stock: 3, reorder: 25, price: 24.99 },
  { id: 10, name: "Webcam HD", sku: "EL-1003", category: "Electronics", stock: 45, reorder: 20, price: 69.99 },
];

const fmt = (n) => "$" + n.toFixed(2);

export function App() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [showLowOnly, setShowLowOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = ITEMS;
    if (catFilter !== "All") list = list.filter((i) => i.category === catFilter);
    if (showLowOnly) list = list.filter((i) => i.stock <= i.reorder);
    if (search) list = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [search, catFilter, showLowOnly]);

  const totalItems = ITEMS.reduce((s, i) => s + i.stock, 0);
  const totalValue = ITEMS.reduce((s, i) => s + i.stock * i.price, 0);
  const lowStock = ITEMS.filter((i) => i.stock <= i.reorder).length;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827] flex items-center gap-2"><Package size={20} className="text-blue-500" /> Inventory</h1>
          <button className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Package size={16} className="text-blue-500 mb-2" />
            <p className="text-2xl font-bold text-[#111827]">{totalItems.toLocaleString()}</p>
            <p className="text-xs text-[#6b7280]">Total Items in Stock</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-[#111827]">{fmt(totalValue)}</p>
            <p className="text-xs text-[#6b7280]">Inventory Value</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <AlertTriangle size={16} className={lowStock > 0 ? "text-red-500 mb-2" : "text-green-500 mb-2"} />
            <p className={"text-2xl font-bold " + (lowStock > 0 ? "text-red-600" : "text-green-600")}>{lowStock}</p>
            <p className="text-xs text-[#6b7280]">Low Stock Alerts</p>
          </div>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items or SKU..." className="w-full rounded-lg bg-white border border-gray-200 py-2.5 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-blue-300" />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-lg bg-white border border-gray-200 px-3 py-2.5 text-sm text-[#111827] outline-none">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button onClick={() => setShowLowOnly((s) => !s)} className={"rounded-lg border px-3 py-2.5 text-xs font-medium transition-all " + (showLowOnly ? "bg-red-50 border-red-200 text-red-600" : "bg-white border-gray-200 text-[#6b7280]")}>
            <AlertTriangle size={12} className="inline mr-1" />Low Stock Only
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Item</th>
              <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">SKU</th>
              <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Category</th>
              <th className="px-4 py-3 text-xs font-medium text-[#6b7280] text-right">Stock</th>
              <th className="px-4 py-3 text-xs font-medium text-[#6b7280] text-right">Reorder</th>
              <th className="px-4 py-3 text-xs font-medium text-[#6b7280] text-right">Price</th>
              <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Status</th>
            </tr></thead>
            <tbody>
              {filtered.map((item) => {
                const low = item.stock <= item.reorder;
                return (
                  <tr key={item.id} className={"border-b border-gray-50 hover:bg-gray-50/50 " + (low ? "bg-red-50/30" : "")}>
                    <td className="px-4 py-3 text-[#111827] font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-[#6b7280] font-mono text-xs">{item.sku}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (CAT_COLOR[item.category] || "")}>{item.category}</span></td>
                    <td className={"px-4 py-3 text-right font-medium " + (low ? "text-red-600" : "text-[#111827]")}>{item.stock}</td>
                    <td className="px-4 py-3 text-right text-[#6b7280]">{item.reorder}</td>
                    <td className="px-4 py-3 text-right text-[#374151]">{fmt(item.price)}</td>
                    <td className="px-4 py-3">{low ? <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle size={12} />Low</span> : <span className="text-xs text-green-600">OK</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center text-sm text-[#6b7280] py-8">No items match your filters</p>}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
