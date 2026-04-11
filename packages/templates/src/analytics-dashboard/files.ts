import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { TrendingUp, TrendingDown, Eye, Users, Clock, MousePointer, BarChart3, Globe } from "lucide-react";

const METRICS = [
  { label: "Pageviews", value: "124,892", change: "+12.3%", up: true, icon: Eye },
  { label: "Visitors", value: "31,247", change: "+8.7%", up: true, icon: Users },
  { label: "Avg. Duration", value: "2m 34s", change: "-4.2%", up: false, icon: Clock },
  { label: "Bounce Rate", value: "38.2%", change: "-2.1%", up: true, icon: MousePointer },
];

const MONTHLY = [42, 55, 48, 62, 58, 73, 68, 82, 76, 91, 85, 98];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TOP_PAGES = [
  { path: "/", views: 34210, pct: 27 },
  { path: "/pricing", views: 18430, pct: 15 },
  { path: "/docs/getting-started", views: 12890, pct: 10 },
  { path: "/blog/launch-post", views: 9840, pct: 8 },
  { path: "/features", views: 8120, pct: 7 },
];

const SOURCES = [
  { name: "Organic Search", visitors: 14200, pct: 45, color: "bg-blue-500" },
  { name: "Direct", visitors: 8100, pct: 26, color: "bg-indigo-500" },
  { name: "Social Media", visitors: 5400, pct: 17, color: "bg-green-500" },
  { name: "Referral", visitors: 2300, pct: 7, color: "bg-amber-500" },
  { name: "Email", visitors: 1247, pct: 4, color: "bg-pink-500" },
];

export function App() {
  const [period, setPeriod] = useState("30d");
  const maxBar = Math.max(...MONTHLY);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827] flex items-center gap-2"><BarChart3 size={20} className="text-indigo-500" /> Analytics</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {["7d", "30d", "90d"].map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={"rounded-md px-3 py-1.5 text-xs font-medium transition-all " + (period === p ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {METRICS.map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50"><m.icon size={16} className="text-indigo-600" /></div>
                <span className={"flex items-center gap-0.5 text-xs font-medium " + (m.up ? "text-green-600" : "text-red-500")}>
                  {m.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{m.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-[#111827]">{m.value}</p>
              <p className="text-xs text-[#6b7280] mt-1">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-[#111827] mb-4">Traffic Trend</h2>
            <div className="flex items-end gap-1.5 h-40">
              {MONTHLY.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end">
                  <div className="w-full rounded-t bg-indigo-500/80 hover:bg-indigo-500 transition-colors" style={{ height: Math.max(4, (val / maxBar) * 100) + "%" }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {MONTHS.map((m) => <span key={m} className="text-[9px] text-[#6b7280] flex-1 text-center">{m}</span>)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-[#111827] mb-4 flex items-center gap-1"><Globe size={14} /> Traffic Sources</h2>
            <div className="space-y-3">
              {SOURCES.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#374151]">{s.name}</span>
                    <span className="text-[#6b7280]">{s.visitors.toLocaleString()} ({s.pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full">
                    <div className={"h-1.5 rounded-full " + s.color} style={{ width: s.pct + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-[#111827] mb-4">Top Pages</h2>
          <div className="space-y-3">
            {TOP_PAGES.map((page, i) => (
              <div key={page.path} className="flex items-center gap-4">
                <span className="text-xs text-[#6b7280] w-4">{i + 1}.</span>
                <span className="flex-1 text-sm text-[#111827] font-mono">{page.path}</span>
                <div className="w-32 h-1.5 bg-gray-100 rounded-full">
                  <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: page.pct + "%" }} />
                </div>
                <span className="text-sm text-[#374151] w-16 text-right">{page.views.toLocaleString()}</span>
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
