import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { LayoutDashboard, Inbox, Users, Settings, ChevronRight, Search, Bell, Plus } from "lucide-react";

const SIDEBAR_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: Inbox, label: "Inbox", id: "inbox", badge: 4 },
  { icon: Users, label: "People", id: "people" },
  { icon: Settings, label: "Settings", id: "settings" },
];

const LIST_ITEMS = [
  { title: "Quarterly Review", detail: "Due tomorrow", meta: "High priority" },
  { title: "Design system audit", detail: "In progress", meta: "3 tasks" },
  { title: "API documentation", detail: "Assigned to you", meta: "2 tasks" },
  { title: "Onboarding flow update", detail: "Waiting for review", meta: "5 tasks" },
  { title: "Performance benchmarks", detail: "Scheduled for Friday", meta: "1 task" },
];

export default function App() {
  const [active, setActive] = useState("dashboard");

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        fontFamily: "-apple-system, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
        background: "#F2F2F7",
      }}
    >
      {/* Apple-style sidebar */}
      <nav
        className="flex flex-col w-56 h-full flex-shrink-0 py-4"
        style={{ background: "#F2F2F7", borderRight: "1px solid #C6C6C8" }}
      >
        <div className="px-4 pb-4 mb-2">
          <h1 className="text-xl font-semibold" style={{ color: "#000000" }}>
            Beomz
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#8E8E93" }}>
            Workspace
          </p>
        </div>

        {SIDEBAR_ITEMS.map(({ icon: Icon, label, id, badge }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg transition-colors text-left"
            style={{
              background: active === id ? "#007AFF" : "transparent",
              color: active === id ? "#FFFFFF" : "#000000",
            }}
          >
            <Icon size={16} />
            <span className="flex-1 text-sm font-medium">{label}</span>
            {badge && (
              <span
                className="text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] text-center"
                style={{
                  background: active === id ? "rgba(255,255,255,0.3)" : "#007AFF",
                  color: active === id ? "#FFFFFF" : "#FFFFFF",
                }}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <header
          className="flex items-center gap-3 px-5 h-14 flex-shrink-0"
          style={{
            background: "rgba(242,242,247,0.8)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid #C6C6C8",
          }}
        >
          <h2 className="flex-1 text-base font-semibold" style={{ color: "#000000" }}>
            {SIDEBAR_ITEMS.find((s) => s.id === active)?.label ?? "App"}
          </h2>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: "#007AFF", color: "#FFFFFF" }}
          >
            <Plus size={14} />
            New
          </button>
          <button className="p-1.5 rounded-lg" style={{ color: "#8E8E93" }}>
            <Search size={16} />
          </button>
          <button className="p-1.5 rounded-lg" style={{ color: "#8E8E93" }}>
            <Bell size={16} />
          </button>
        </header>

        {/* List content */}
        <main className="flex-1 overflow-auto p-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Total", value: "48", color: "#007AFF" },
              { label: "Active", value: "12", color: "#34C759" },
              { label: "Done", value: "36", color: "#8E8E93" },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-2xl p-4"
                style={{ background: "#FFFFFF" }}
              >
                <p
                  className="text-2xl font-semibold"
                  style={{ color: c.color }}
                >
                  {c.value}
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8E8E93" }}>
                  {c.label}
                </p>
              </div>
            ))}
          </div>

          {/* Apple-style list: full-width rows with chevron disclosure */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF" }}>
            {LIST_ITEMS.map((item, i) => (
              <button
                key={i}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F2F2F7]"
                style={{ borderBottom: i < LIST_ITEMS.length - 1 ? "1px solid #E5E5EA" : "none" }}
              >
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ background: "#E5E5EA" }}
                >
                  <span className="text-xs font-semibold" style={{ color: "#3C3C43" }}>
                    {item.title.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#000000" }}>
                    {item.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#8E8E93" }}>
                    {item.detail} · {item.meta}
                  </p>
                </div>
                <ChevronRight size={14} style={{ color: "#C7C7CC", flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
`,
  },
];
