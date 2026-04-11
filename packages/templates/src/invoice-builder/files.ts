import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, FileText, Building2 } from "lucide-react";

let nextId = 1;

export function App() {
  const [companyName, setCompanyName] = useState("My Company");
  const [companyEmail, setCompanyEmail] = useState("billing@mycompany.com");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("INV-0001");
  const [dueDate, setDueDate] = useState("");
  const [tax, setTax] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("Payment due within 30 days. Thank you for your business.");
  const [items, setItems] = useState([{ id: nextId++, desc: "Design Services", qty: 1, rate: 2500 }]);
  const [view, setView] = useState("edit");

  const addItem = useCallback(() => { setItems((prev) => [...prev, { id: nextId++, desc: "", qty: 1, rate: 0 }]); }, []);
  const removeItem = useCallback((id) => { setItems((prev) => prev.filter((i) => i.id !== id)); }, []);
  const updateItem = useCallback((id, field, val) => { setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: val } : i)); }, []);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.qty * i.rate, 0), [items]);
  const taxAmt = subtotal * (parseFloat(tax) || 0) / 100;
  const discountAmt = subtotal * (parseFloat(discount) || 0) / 100;
  const total = subtotal + taxAmt - discountAmt;

  const fmt = (n) => "$" + n.toFixed(2);
  const todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><FileText size={20} /> Invoice Builder</h1>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {["edit", "preview"].map((v) => (
              <button key={v} onClick={() => setView(v)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (view === v ? "bg-zinc-800 text-white" : "text-zinc-500")}>{v}</button>
            ))}
          </div>
        </div>

        {view === "edit" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
                <h3 className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1"><Building2 size={12} /> Your Company</h3>
                <input placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
                <input placeholder="Email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              </div>
              <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
                <h3 className="text-xs font-medium text-zinc-400 mb-3">Bill To</h3>
                <input placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
                <input placeholder="Client email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="text-[10px] text-zinc-500 mb-1 block">Invoice #</label>
                  <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-zinc-500 mb-1 block">Due Date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none" />
                </div>
                <div className="w-20">
                  <label className="text-[10px] text-zinc-500 mb-1 block">Tax %</label>
                  <input type="number" value={tax} onChange={(e) => setTax(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-center" />
                </div>
                <div className="w-20">
                  <label className="text-[10px] text-zinc-500 mb-1 block">Disc %</label>
                  <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-center" />
                </div>
              </div>
              <div className="space-y-2 mb-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input value={item.desc} onChange={(e) => updateItem(item.id, "desc", e.target.value)} placeholder="Description" className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
                    <input type="number" value={item.qty} onChange={(e) => updateItem(item.id, "qty", parseInt(e.target.value) || 0)} className="w-16 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-center" />
                    <input type="number" value={item.rate} onChange={(e) => updateItem(item.id, "rate", parseFloat(e.target.value) || 0)} className="w-24 rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-right" />
                    <span className="w-20 text-right text-sm text-zinc-400">{fmt(item.qty * item.rate)}</span>
                    <button onClick={() => removeItem(item.id)} className="text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><Plus size={13} /> Add line item</button>
            </div>

            <textarea placeholder="Notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-2xl bg-zinc-900 border border-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none" />
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-8 text-zinc-900">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-2xl font-bold">{companyName || "Company"}</h2>
                <p className="text-sm text-zinc-500">{companyEmail}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400">INVOICE</p>
                <p className="text-sm font-medium">{invoiceNo}</p>
                <p className="text-xs text-zinc-500 mt-1">{todayStr}</p>
                {dueDate && <p className="text-xs text-zinc-500">Due: {dueDate}</p>}
              </div>
            </div>
            <div className="mb-6">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Bill To</p>
              <p className="text-sm font-medium">{clientName || "Client"}</p>
              <p className="text-sm text-zinc-500">{clientEmail}</p>
            </div>
            <table className="w-full mb-6 text-sm">
              <thead><tr className="border-b border-zinc-200"><th className="text-left py-2 font-medium text-zinc-500">Description</th><th className="py-2 font-medium text-zinc-500 w-16 text-center">Qty</th><th className="py-2 font-medium text-zinc-500 w-24 text-right">Rate</th><th className="py-2 font-medium text-zinc-500 w-24 text-right">Amount</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100"><td className="py-2">{item.desc || "—"}</td><td className="py-2 text-center">{item.qty}</td><td className="py-2 text-right">{fmt(item.rate)}</td><td className="py-2 text-right">{fmt(item.qty * item.rate)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <div className="w-52 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Subtotal</span><span>{fmt(subtotal)}</span></div>
                {parseFloat(tax) > 0 && <div className="flex justify-between"><span className="text-zinc-500">Tax ({tax}%)</span><span>{fmt(taxAmt)}</span></div>}
                {parseFloat(discount) > 0 && <div className="flex justify-between"><span className="text-zinc-500">Discount ({discount}%)</span><span>-{fmt(discountAmt)}</span></div>}
                <div className="flex justify-between border-t border-zinc-200 pt-1 mt-1 font-bold text-lg"><span>Total</span><span>{fmt(total)}</span></div>
              </div>
            </div>
            {notes && <p className="mt-6 text-xs text-zinc-400 border-t border-zinc-100 pt-4">{notes}</p>}
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
