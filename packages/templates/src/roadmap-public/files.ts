import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Lightbulb, Clock, Rocket, Check, ThumbsUp } from "lucide-react";

const COLUMNS = [
  { id: "planned", label: "Planned", icon: Lightbulb, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { id: "in-progress", label: "In Progress", icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  { id: "shipped", label: "Shipped", icon: Check, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
];

const ITEMS = [
  { id: 1, title: "AI-powered search", description: "Smart search that understands natural language queries", status: "planned", votes: 142, category: "Feature" },
  { id: 2, title: "Custom dashboards", description: "Build your own dashboard layouts with drag and drop", status: "planned", votes: 98, category: "Feature" },
  { id: 3, title: "Slack integration", description: "Get notifications and take actions directly from Slack", status: "in-progress", votes: 234, category: "Integration" },
  { id: 4, title: "Mobile app (iOS/Android)", description: "Native mobile experience for on-the-go access", status: "in-progress", votes: 312, category: "Platform" },
  { id: 5, title: "API rate limit increase", description: "Higher API limits for Pro and Enterprise plans", status: "in-progress", votes: 87, category: "API" },
  { id: 6, title: "Dark mode", description: "System-wide dark theme for better night-time usage", status: "shipped", votes: 456, category: "Feature" },
  { id: 7, title: "CSV/Excel export", description: "Export your data in CSV and Excel formats", status: "shipped", votes: 189, category: "Feature" },
  { id: 8, title: "Two-factor authentication", description: "Enhanced security with TOTP-based 2FA", status: "shipped", votes: 267, category: "Security" },
  { id: 9, title: "Webhook support", description: "Real-time event webhooks for custom integrations", status: "shipped", votes: 134, category: "Integration" },
  { id: 10, title: "Team permissions", description: "Granular role-based access control for teams", status: "planned", votes: 176, category: "Feature" },
];

export function App() {
  const [votes, setVotes] = useState({});
  const [filter, setFilter] = useState("All");

  const categories = useMemo(() => ["All", ...new Set(ITEMS.map((i) => i.category))], []);

  const toggleVote = (id) => setVotes((prev) => ({ ...prev, [id]: !prev[id] }));
  const getVotes = (item) => item.votes + (votes[item.id] ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2"><Rocket size={24} className="text-blue-500" /></div>
          <h1 className="text-2xl font-bold text-[#111827] mb-2">Product Roadmap</h1>
          <p className="text-sm text-[#6b7280]">See what we're building next. Vote on features that matter to you.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-6 justify-center">
          {categories.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={"rounded-full px-3 py-1.5 text-xs font-medium border transition-all " + (filter === c ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-white text-[#6b7280] border-gray-200")}>
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const colItems = ITEMS.filter((i) => i.status === col.id && (filter === "All" || i.category === filter)).sort((a, b) => getVotes(b) - getVotes(a));
            return (
              <div key={col.id}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={"flex h-6 w-6 items-center justify-center rounded-md " + col.bg}><Icon size={14} className={col.color} /></div>
                  <span className={"text-sm font-semibold " + col.color}>{col.label}</span>
                  <span className="text-xs text-[#6b7280] ml-auto">{colItems.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colItems.map((item) => {
                    const voted = !!votes[item.id];
                    return (
                      <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start gap-3">
                          <button onClick={() => toggleVote(item.id)} className={"flex flex-col items-center rounded-lg border px-2 py-1.5 transition-all " + (voted ? "bg-blue-50 border-blue-200 text-blue-600" : "border-gray-200 text-[#6b7280] hover:border-blue-200")}>
                            <ThumbsUp size={13} />
                            <span className="text-[10px] font-bold mt-0.5">{getVotes(item)}</span>
                          </button>
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-[#111827]">{item.title}</h3>
                            <p className="text-xs text-[#6b7280] mt-0.5">{item.description}</p>
                            <span className="inline-block mt-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">{item.category}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {colItems.length === 0 && <p className="text-center text-xs text-[#6b7280] py-4">No items</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
