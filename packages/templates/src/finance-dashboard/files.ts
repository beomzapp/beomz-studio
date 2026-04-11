import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { DollarSign, TrendingUp, TrendingDown, PieChart, ArrowUpRight } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const INCOME_DATA = [4200, 4200, 4500, 4500, 4800, 4800, 5100, 5100, 5100, 5400, 5400, 5700];
const EXPENSE_DATA = [3100, 2800, 3400, 3000, 3200, 2900, 3500, 3100, 2700, 3300, 3000, 3200];

const CATEGORIES = [
  { name: "Housing", amount: 1450, color: "bg-blue-500", pct: 42 },
  { name: "Food", amount: 620, color: "bg-orange-500", pct: 18 },
  { name: "Transport", amount: 380, color: "bg-purple-500", pct: 11 },
  { name: "Entertainment", amount: 290, color: "bg-pink-500", pct: 8 },
  { name: "Utilities", amount: 240, color: "bg-cyan-500", pct: 7 },
  { name: "Other", amount: 480, color: "bg-zinc-500", pct: 14 },
];

const TRANSACTIONS = [
  { id: 1, name: "Salary Deposit", amount: 5700, type: "income", date: "Today" },
  { id: 2, name: "Rent Payment", amount: -1450, type: "expense", date: "Yesterday" },
  { id: 3, name: "Grocery Store", amount: -127.43, type: "expense", date: "Yesterday" },
  { id: 4, name: "Freelance Project", amount: 850, type: "income", date: "Apr 8" },
  { id: 5, name: "Electric Bill", amount: -94.20, type: "expense", date: "Apr 7" },
  { id: 6, name: "Coffee Shop", amount: -6.50, type: "expense", date: "Apr 7" },
];

const fmt = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function App() {
  const [period, setPeriod] = useState("year");

  const totalIncome = useMemo(() => INCOME_DATA.reduce((s, v) => s + v, 0), []);
  const totalExpenses = useMemo(() => EXPENSE_DATA.reduce((s, v) => s + v, 0), []);
  const savings = totalIncome - totalExpenses;
  const savingsRate = Math.round((savings / totalIncome) * 100);
  const maxBar = Math.max(...INCOME_DATA, ...EXPENSE_DATA);

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Finance Dashboard</h1>
            <p className="text-sm text-zinc-500">Your money at a glance</p>
          </div>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {["month", "year"].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (period === p ? "bg-zinc-800 text-white" : "text-zinc-500")}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Income", value: fmt(totalIncome), change: "+8.2%", up: true, icon: TrendingUp, color: "text-green-400" },
            { label: "Expenses", value: fmt(totalExpenses), change: "-3.1%", up: false, icon: TrendingDown, color: "text-red-400" },
            { label: "Savings", value: fmt(savings), change: "+12%", up: true, icon: DollarSign, color: "text-emerald-400" },
            { label: "Savings Rate", value: savingsRate + "%", change: "+2%", up: true, icon: PieChart, color: "text-cyan-400" },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <m.icon size={16} className="text-zinc-500" />
                <span className={"text-xs font-medium " + (m.up ? "text-green-400" : "text-red-400")}>{m.change}</span>
              </div>
              <p className={"text-2xl font-bold " + m.color}>{m.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2 rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <h2 className="text-sm font-medium text-white mb-4">Income vs Expenses</h2>
            <div className="flex items-end gap-1 h-36">
              {MONTHS.map((m, i) => (
                <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex gap-0.5">
                    <div className="flex-1 rounded-t bg-green-500/70" style={{ height: Math.max(4, (INCOME_DATA[i] / maxBar) * 140) + "px" }} />
                    <div className="flex-1 rounded-t bg-red-500/50" style={{ height: Math.max(4, (EXPENSE_DATA[i] / maxBar) * 140) + "px" }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {MONTHS.map((m) => <span key={m} className="text-[9px] text-zinc-600 flex-1 text-center">{m}</span>)}
            </div>
            <div className="flex gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-xs text-zinc-500"><span className="h-2 w-2 rounded-full bg-green-500" />Income</span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500"><span className="h-2 w-2 rounded-full bg-red-500" />Expenses</span>
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
            <h2 className="text-sm font-medium text-white mb-4">Spending by Category</h2>
            <div className="space-y-3">
              {CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">{cat.name}</span>
                    <span className="text-zinc-500">{fmt(cat.amount)}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full">
                    <div className={"h-1.5 rounded-full " + cat.color} style={{ width: cat.pct + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">Recent Transactions</h2>
            <ArrowUpRight size={14} className="text-zinc-500" />
          </div>
          <div className="space-y-2">
            {TRANSACTIONS.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm text-white">{tx.name}</p>
                  <p className="text-xs text-zinc-600">{tx.date}</p>
                </div>
                <span className={"text-sm font-medium " + (tx.amount >= 0 ? "text-green-400" : "text-red-400")}>{fmt(tx.amount)}</span>
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
