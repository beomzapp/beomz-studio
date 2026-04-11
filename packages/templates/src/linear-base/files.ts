import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { LayoutGrid, GitBranch, CheckSquare, Settings, Search, Plus, Circle, AlertCircle, Clock } from "lucide-react";

const SIDEBAR_SECTIONS = [
  {
    label: "WORKSPACE",
    items: [
      { icon: LayoutGrid, label: "All Issues", id: "all", count: 24 },
      { icon: GitBranch, label: "My Issues", id: "mine", count: 8 },
      { icon: CheckSquare, label: "Projects", id: "projects" },
      { icon: Settings, label: "Settings", id: "settings" },
    ],
  },
  {
    label: "TEAMS",
    items: [
      { label: "Engineering", id: "eng", dot: "#5E6AD2" },
      { label: "Design", id: "design", dot: "#26B5CE" },
      { label: "Product", id: "product", dot: "#F2994A" },
    ],
  },
];

const ISSUES = [
  { id: "ENG-142", title: "Fix authentication token refresh", priority: "urgent", status: "in-progress", assignee: "SR" },
  { id: "ENG-141", title: "Improve bundle size — reduce by 30%", priority: "high", status: "todo", assignee: "AL" },
  { id: "ENG-139", title: "Add rate limiting to API endpoints", priority: "medium", status: "todo", assignee: "JL" },
  { id: "ENG-138", title: "Write migration guide for v2", priority: "low", status: "in-progress", assignee: "MK" },
  { id: "ENG-137", title: "Update CI/CD pipeline configuration", priority: "medium", status: "done", assignee: "SR" },
  { id: "ENG-135", title: "Refactor database query layer", priority: "high", status: "done", assignee: "AL" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#E11D48",
  high: "#F97316",
  medium: "#EAB308",
  low: "#6B7280",
};

const STATUS_LABELS: Record<string, string> = {
  "todo": "Todo",
  "in-progress": "In Progress",
  "done": "Done",
};

export default function App() {
  const [active, setActive] = useState("all");
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter ? ISSUES.filter((i) => i.status === filter) : ISSUES;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: "13px",
        background: "#FFFFFF",
      }}
    >
      {/* Linear-style compact sidebar */}
      <nav
        className="flex flex-col w-[220px] h-full flex-shrink-0 py-2"
        style={{ background: "#F7F7F7", borderRight: "1px solid #E5E5E5" }}
      >
        {/* Workspace header */}
        <div className="flex items-center gap-2 px-3 py-2 mb-2">
          <div
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: "#5E6AD2" }}
          >
            <span className="text-white text-[10px] font-bold">B</span>
          </div>
          <span className="font-semibold text-[13px]" style={{ color: "#1A1A1A" }}>
            Beomz
          </span>
        </div>

        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.label} className="mb-3">
            <p
              className="px-3 py-1 text-[11px] font-medium tracking-wide"
              style={{ color: "#9CA3AF" }}
            >
              {section.label}
            </p>
            {section.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 rounded transition-colors text-left"
                style={{
                  background: active === item.id ? "#EBEBEB" : "transparent",
                  color: active === item.id ? "#1A1A1A" : "#4B5563",
                }}
              >
                {"dot" in item ? (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: item.dot }}
                  />
                ) : (
                  item.icon && <item.icon size={14} className="flex-shrink-0" />
                )}
                <span className="flex-1 truncate">{item.label}</span>
                {"count" in item && item.count && (
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: "#9CA3AF" }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar — Linear style */}
        <header
          className="flex items-center gap-2 px-4 h-10 flex-shrink-0"
          style={{ borderBottom: "1px solid #E5E5E5" }}
        >
          <h2 className="font-semibold text-[13px] flex-1" style={{ color: "#1A1A1A" }}>
            All Issues
          </h2>
          {/* Status filters */}
          {(["todo", "in-progress", "done"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? null : s)}
              className="px-2 py-1 rounded text-[12px] transition-colors"
              style={{
                background: filter === s ? "#5E6AD2" : "transparent",
                color: filter === s ? "#FFFFFF" : "#6B7280",
                border: "1px solid",
                borderColor: filter === s ? "#5E6AD2" : "#E5E5E5",
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          <button className="p-1 rounded" style={{ color: "#6B7280" }}>
            <Search size={14} />
          </button>
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[12px] font-medium"
            style={{ background: "#5E6AD2", color: "#FFFFFF" }}
          >
            <Plus size={12} />
            New issue
          </button>
        </header>

        {/* Issue list — Linear tight rows */}
        <main className="flex-1 overflow-auto">
          {/* Column headers */}
          <div
            className="flex items-center gap-2 px-4 h-8 sticky top-0"
            style={{ background: "#FAFAFA", borderBottom: "1px solid #E5E5E5" }}
          >
            <span className="w-20 text-[11px]" style={{ color: "#9CA3AF" }}>ID</span>
            <span className="flex-1 text-[11px]" style={{ color: "#9CA3AF" }}>Title</span>
            <span className="w-20 text-[11px]" style={{ color: "#9CA3AF" }}>Status</span>
            <span className="w-8 text-[11px]" style={{ color: "#9CA3AF" }}>Who</span>
          </div>

          {filtered.map((issue, i) => (
            <div
              key={issue.id}
              className="flex items-center gap-2 px-4 h-9 cursor-pointer hover:bg-[#F9F9F9]"
              style={{ borderBottom: "1px solid #F3F4F6" }}
            >
              {/* Priority dot */}
              <Circle
                size={8}
                fill={PRIORITY_COLORS[issue.priority]}
                style={{ color: PRIORITY_COLORS[issue.priority], flexShrink: 0 }}
              />
              {/* ID */}
              <span
                className="w-16 font-mono text-[12px]"
                style={{ color: "#9CA3AF" }}
              >
                {issue.id}
              </span>
              {/* Title */}
              <span
                className="flex-1 truncate text-[13px]"
                style={{
                  color: issue.status === "done" ? "#9CA3AF" : "#1A1A1A",
                  textDecoration: issue.status === "done" ? "line-through" : "none",
                }}
              >
                {issue.title}
              </span>
              {/* Status */}
              <span
                className="w-20 text-[12px]"
                style={{ color: "#6B7280" }}
              >
                {STATUS_LABELS[issue.status]}
              </span>
              {/* Assignee */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                style={{ background: "#E5E7EB", color: "#374151" }}
              >
                {issue.assignee}
              </div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
`,
  },
];
