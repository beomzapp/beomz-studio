import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, FileText } from "lucide-react";

let nextId = 1;

export function App() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-001");
  const [taxRate, setTaxRate] = useState("10");
  const [items, setItems] = useState([
    { id: nextId++, description: "Website Design", qty: 1, price: 2500 },
    { id: nextId++, description: "Logo Design", qty: 1, price: 800 },
  ]);
  const [view, setView] = useState("edit");

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { id: nextId++, description: "", qty: 1, price: 0 }]);
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateItem = useCallback((id, field, value) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i));
  }, []);

  const { subtotal, tax, total } = useMemo(() => {
    const sub = items.reduce((s, i) => s + i.qty * i.price, 0);
    const t = sub * (parseFloat(taxRate) || 0) / 100;
    return { subtotal: sub, tax: t, total: sub + t };
  }, [items, taxRate]);

  const fmt = (n) => "$" + n.toFixed(2);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><FileText size={20} /> Invoice Generator</h1>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {["edit", "preview"].map((v) => (
              <button key={v} onClick={() => setView(v)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (view === v ? "bg-zinc-800 text-white" : "text-zinc-500")}>{v}</button>
            ))}
          </div>
        </div>

        {view === "edit" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Client Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} className="rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none" />
                <input placeholder="Client email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none" />
                <input placeholder="Invoice #" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-white text-sm placeholder-zinc-600 outline-none" />
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-zinc-400">Line Items</h2>
                <button onClick={addItem} className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"><Plus size={14} /> Add Item</button>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} placeholder="Description" className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
                    <input type="number" value={item.qty} onChange={(e) => updateItem(item.id, "qty", parseInt(e.target.value) || 0)} className="w-16 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-center" />
                    <input type="number" value={item.price} onChange={(e) => updateItem(item.id, "price", parseFloat(e.target.value) || 0)} className="w-24 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-right" />
                    <span className="w-20 text-right text-sm text-zinc-400">{fmt(item.qty * item.price)}</span>
                    <button onClick={() => removeItem(item.id)} className="text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-zinc-500">Tax %</span>
                <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="w-16 rounded-lg bg-zinc-800 border border-white/5 px-2 py-1.5 text-sm text-white outline-none text-center" />
              </div>
            </div>
          </div>
        )}

        {view === "preview" && (
          <div className="rounded-2xl bg-white p-8 text-zinc-900">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">INVOICE</h2>
                <p className="text-sm text-zinc-500 mt-1">{invoiceNumber}</p>
              </div>
              <div className="text-right text-sm text-zinc-500">
                <p>{today}</p>
              </div>
            </div>
            <div className="mb-8">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Bill To</p>
              <p className="text-sm font-medium">{clientName || "Client Name"}</p>
              <p className="text-sm text-zinc-500">{clientEmail || "client@email.com"}</p>
            </div>
            <table className="w-full mb-6 text-sm">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="text-left py-2 font-medium text-zinc-500">Description</th>
                  <th className="text-center py-2 font-medium text-zinc-500 w-16">Qty</th>
                  <th className="text-right py-2 font-medium text-zinc-500 w-24">Price</th>
                  <th className="text-right py-2 font-medium text-zinc-500 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="py-2">{item.description || "—"}</td>
                    <td className="py-2 text-center">{item.qty}</td>
                    <td className="py-2 text-right">{fmt(item.price)}</td>
                    <td className="py-2 text-right">{fmt(item.qty * item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <div className="w-48 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span>{fmt(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Tax ({taxRate}%)</span><span>{fmt(tax)}</span></div>
                <div className="flex justify-between border-t border-zinc-200 pt-1 mt-1 font-bold text-base"><span>Total</span><span>{fmt(total)}</span></div>
              </div>
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
