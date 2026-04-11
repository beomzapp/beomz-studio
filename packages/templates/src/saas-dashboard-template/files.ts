import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { TrendingUp, TrendingDown, Users, DollarSign, Activity, ArrowUpRight } from "lucide-react";

const METRICS = [
  { label: "MRR", value: "$48,250", change: "+12.5%", up: true, icon: DollarSign },
  { label: "Active Users", value: "2,847", change: "+8.2%", up: true, icon: Users },
  { label: "Churn Rate", value: "2.1%", change: "-0.4%", up: false, icon: Activity },
  { label: "ARPU", value: "$16.95", change: "+3.1%", up: true, icon: TrendingUp },
];

const ACTIVITY = [
  { id: 1, user: "Sarah Chen", action: "upgraded to Pro plan", time: "2 min ago", avatar: "SC" },
  { id: 2, user: "Alex Rivera", action: "submitted a support ticket", time: "15 min ago", avatar: "AR" },
  { id: 3, user: "Jordan Lee", action: "invited 3 team members", time: "1 hr ago", avatar: "JL" },
  { id: 4, user: "Morgan Park", action: "cancelled subscription", time: "2 hr ago", avatar: "MP" },
  { id: 5, user: "Casey Kim", action: "completed onboarding", time: "3 hr ago", avatar: "CK" },
];

const USERS_TABLE = [
  { id: 1, name: "Sarah Chen", email: "sarah@company.co", plan: "Pro", mrr: "$49", status: "Active" },
  { id: 2, name: "Alex Rivera", email: "alex@startup.io", plan: "Team", mrr: "$149", status: "Active" },
  { id: 3, name: "Jordan Lee", email: "jordan@agency.com", plan: "Pro", mrr: "$49", status: "Active" },
  { id: 4, name: "Morgan Park", email: "morgan@freelance.co", plan: "Free", mrr: "$0", status: "Churned" },
  { id: 5, name: "Casey Kim", email: "casey@dev.io", plan: "Pro", mrr: "$49", status: "Trial" },
  { id: 6, name: "Taylor Wu", email: "taylor@design.co", plan: "Team", mrr: "$149", status: "Active" },
];

export function App() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Dashboard</h1>
            <p className="text-sm text-zinc-500">Welcome back — here's your overview</p>
          </div>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {["overview", "users"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " +
                  (activeTab === tab ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {METRICS.map((m) => (
            <div key={m.label} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <m.icon size={16} className="text-zinc-500" />
                <span className={"flex items-center gap-0.5 text-xs font-medium " + (m.up ? "text-green-400" : "text-red-400")}>
                  {m.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {m.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-white">{m.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{m.label}</p>
            </div>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-3 rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <h2 className="text-sm font-medium text-white mb-4">Revenue Trend</h2>
              <div className="flex items-end gap-1.5 h-40">
                {[35, 42, 38, 50, 45, 55, 48, 60, 58, 65, 62, 70].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end">
                    <div className="rounded-t bg-blue-600/80 hover:bg-blue-500 transition-colors" style={{ height: h + "%" }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-zinc-600">Jan</span>
                <span className="text-[10px] text-zinc-600">Dec</span>
              </div>
            </div>

            <div className="md:col-span-2 rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-white">Recent Activity</h2>
                <ArrowUpRight size={14} className="text-zinc-500" />
              </div>
              <div className="space-y-3">
                {ACTIVITY.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-400 flex-shrink-0">
                      {item.avatar}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-300">
                        <span className="font-medium text-white">{item.user}</span> {item.action}
                      </p>
                      <span className="text-xs text-zinc-600">{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3 text-xs font-medium text-zinc-500">Name</th>
                  <th className="px-5 py-3 text-xs font-medium text-zinc-500 hidden md:table-cell">Email</th>
                  <th className="px-5 py-3 text-xs font-medium text-zinc-500">Plan</th>
                  <th className="px-5 py-3 text-xs font-medium text-zinc-500">MRR</th>
                  <th className="px-5 py-3 text-xs font-medium text-zinc-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {USERS_TABLE.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 last:border-b-0 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-5 py-3 text-sm text-white">{user.name}</td>
                    <td className="px-5 py-3 text-sm text-zinc-400 hidden md:table-cell">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{user.plan}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-zinc-300">{user.mrr}</td>
                    <td className="px-5 py-3">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-medium " +
                        (user.status === "Active" ? "bg-green-600/20 text-green-400" :
                         user.status === "Trial" ? "bg-blue-600/20 text-blue-400" :
                         "bg-red-600/20 text-red-400")}>
                        {user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
