import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { Tag, Sparkles, Wrench, Bug, Zap } from "lucide-react";

const TYPE_CONFIG = {
  feature: { label: "Feature", icon: Sparkles, color: "bg-green-50 text-green-600 border-green-200" },
  improvement: { label: "Improvement", icon: Zap, color: "bg-blue-50 text-blue-600 border-blue-200" },
  fix: { label: "Bug Fix", icon: Bug, color: "bg-red-50 text-red-600 border-red-200" },
  maintenance: { label: "Maintenance", icon: Wrench, color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const RELEASES = [
  { version: "2.4.0", date: "April 10, 2024", items: [
    { type: "feature", text: "Added real-time collaboration for team workspaces" },
    { type: "feature", text: "New analytics dashboard with custom date ranges" },
    { type: "improvement", text: "50% faster page load times across the application" },
    { type: "fix", text: "Fixed intermittent logout issue on mobile Safari" },
  ]},
  { version: "2.3.2", date: "March 28, 2024", items: [
    { type: "fix", text: "Resolved CSV export missing column headers" },
    { type: "fix", text: "Fixed timezone display in activity feed" },
    { type: "maintenance", text: "Updated dependencies to latest stable versions" },
  ]},
  { version: "2.3.0", date: "March 15, 2024", items: [
    { type: "feature", text: "Introduced webhook integrations for Slack and Discord" },
    { type: "feature", text: "Added dark mode support across all pages" },
    { type: "improvement", text: "Redesigned settings page with better organization" },
    { type: "improvement", text: "Improved search with fuzzy matching and filters" },
    { type: "fix", text: "Fixed pagination bug in large data tables" },
  ]},
  { version: "2.2.0", date: "February 20, 2024", items: [
    { type: "feature", text: "API v2 with rate limiting and better error responses" },
    { type: "improvement", text: "Onboarding flow redesigned for faster setup" },
    { type: "maintenance", text: "Migrated database to new cluster for better uptime" },
  ]},
];

export function App() {
  const [filter, setFilter] = useState("all");

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-[#111827] mb-2">Changelog</h1>
          <p className="text-sm text-[#6b7280]">New updates and improvements to our product</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8 justify-center">
          <button onClick={() => setFilter("all")} className={"rounded-full px-3 py-1.5 text-xs font-medium border transition-all " + (filter === "all" ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-white text-[#6b7280] border-gray-200")}>
            All Updates
          </button>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <button key={key} onClick={() => setFilter(key)} className={"rounded-full px-3 py-1.5 text-xs font-medium border transition-all " + (filter === key ? cfg.color : "bg-white text-[#6b7280] border-gray-200")}>
              {cfg.label}
            </button>
          ))}
        </div>

        <div className="space-y-10">
          {RELEASES.map((release) => {
            const items = filter === "all" ? release.items : release.items.filter((i) => i.type === filter);
            if (items.length === 0) return null;
            return (
              <div key={release.version} className="relative pl-8 border-l-2 border-gray-200">
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-indigo-500 border-2 border-white" />
                <div className="mb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-semibold text-indigo-600">
                      <Tag size={11} /> v{release.version}
                    </span>
                    <span className="text-sm text-[#6b7280]">{release.date}</span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {items.map((item, i) => {
                    const cfg = TYPE_CONFIG[item.type];
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 bg-white rounded-lg border border-gray-200 p-3">
                        <div className={"flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0 mt-0.5 " + cfg.color.split(" ").slice(0, 1).join(" ")}>
                          <Icon size={12} className={cfg.color.split(" ")[1]} />
                        </div>
                        <div className="flex-1">
                          <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-medium border " + cfg.color}>{cfg.label}</span>
                          <p className="text-sm text-[#374151] mt-1">{item.text}</p>
                        </div>
                      </div>
                    );
                  })}
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
