import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart, Eye } from "lucide-react";

const PERIODS = ["Today", "7 Days", "30 Days", "90 Days"];

const KPI = [
  { label: "Revenue", value: "$48,250", change: "+12.5%", up: true, icon: DollarSign, prev: "$42,900" },
  { label: "Orders", value: "1,247", change: "+8.2%", up: true, icon: ShoppingCart, prev: "1,152" },
  { label: "Users", value: "31,847", change: "+15.1%", up: true, icon: Users, prev: "27,670" },
  { label: "Page Views", value: "124.8K", change: "-2.3%", up: false, icon: Eye, prev: "127.7K" },
];

const MONTHLY_REV = [28, 32, 29, 38, 35, 42, 39, 45, 48, 52, 47, 55];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TOP_PRODUCTS = [
  { name: "Pro Plan", revenue: 18400, units: 368, pct: 38 },
  { name: "Team Plan", revenue: 14200, units: 142, pct: 29 },
  { name: "Enterprise", revenue: 9800, units: 14, pct: 20 },
  { name: "Starter", revenue: 4100, units: 820, pct: 8 },
  { name: "Add-ons", revenue: 1750, units: 350, pct: 4 },
];

const RECENT_ORDERS = [
  { id: "ORD-1247", customer: "Acme Corp", amount: 2400, status: "Completed", date: "Today" },
  { id: "ORD-1246", customer: "TechStart Inc", amount: 1200, status: "Processing", date: "Today" },
  { id: "ORD-1245", customer: "GlobalFin", amount: 4800, status: "Completed", date: "Yesterday" },
  { id: "ORD-1244", customer: "Pixel Studio", amount: 600, status: "Completed", date: "Yesterday" },
  { id: "ORD-1243", customer: "DataFlow", amount: 3600, status: "Refunded", date: "Apr 8" },
];

const fmt = (n) => "$" + n.toLocaleString();

export function App() {
  const [period, setPeriod] = useState("30 Days");
  const maxBar = Math.max(...MONTHLY_REV);

  const statusColor = { Completed: "bg-green-50 text-green-600", Processing: "bg-blue-50 text-blue-600", Refunded: "bg-red-50 text-red-600" };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827] flex items-center gap-2"><BarChart3 size={20} className="text-blue-500" /> Reports</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={"rounded-md px-3 py-1.5 text-xs font-medium transition-all " + (period === p ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {KPI.map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50"><k.icon size={16} className="text-blue-600" /></div>
                <span className={"flex items-center gap-0.5 text-xs font-medium " + (k.up ? "text-green-600" : "text-red-500")}>
                  {k.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{k.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-[#111827]">{k.value}</p>
              <p className="text-xs text-[#6b7280] mt-1">{k.label} <span className="text-[#9ca3af]">vs {k.prev}</span></p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-[#111827] mb-4">Monthly Revenue</h2>
            <div className="flex items-end gap-1.5 h-40">
              {MONTHLY_REV.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full rounded-t bg-blue-500/80 hover:bg-blue-500 transition-colors" style={{ height: Math.max(4, (val / maxBar) * 100) + "%" }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {MONTHS.map((m) => <span key={m} className="text-[9px] text-[#6b7280] flex-1 text-center">{m}</span>)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-[#111827] mb-4">Top Products</h2>
            <div className="space-y-3">
              {TOP_PRODUCTS.map((p) => (
                <div key={p.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#374151]">{p.name}</span>
                    <span className="text-[#6b7280]">{fmt(p.revenue)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full">
                    <div className="h-1.5 bg-indigo-500 rounded-full" style={{ width: p.pct + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-medium text-[#111827]">Recent Orders</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-5 py-3 text-xs font-medium text-[#6b7280]">Order ID</th>
              <th className="px-5 py-3 text-xs font-medium text-[#6b7280]">Customer</th>
              <th className="px-5 py-3 text-xs font-medium text-[#6b7280] text-right">Amount</th>
              <th className="px-5 py-3 text-xs font-medium text-[#6b7280]">Status</th>
              <th className="px-5 py-3 text-xs font-medium text-[#6b7280]">Date</th>
            </tr></thead>
            <tbody>
              {RECENT_ORDERS.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-[#111827] font-mono text-xs">{o.id}</td>
                  <td className="px-5 py-3 text-[#374151]">{o.customer}</td>
                  <td className="px-5 py-3 text-right text-[#111827] font-medium">{fmt(o.amount)}</td>
                  <td className="px-5 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (statusColor[o.status] || "")}>{o.status}</span></td>
                  <td className="px-5 py-3 text-[#6b7280]">{o.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
