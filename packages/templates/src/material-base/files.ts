import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { LayoutDashboard, BarChart2, Users, Settings, Menu, Search, Bell, Plus, ChevronRight } from "lucide-react";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: BarChart2, label: "Analytics", id: "analytics" },
  { icon: Users, label: "People", id: "people" },
  { icon: Settings, label: "Settings", id: "settings" },
];

const CARDS = [
  { title: "Total Records", value: "1,284", sub: "Updated just now" },
  { title: "Active", value: "892", sub: "+12% this week" },
  { title: "Pending Review", value: "47", sub: "3 require action" },
];

const ACTIVITY = [
  { label: "Record updated by Sarah Chen", time: "2m ago", init: "SC" },
  { label: "New request submitted by Alex Rivera", time: "15m ago", init: "AR" },
  { label: "Report exported successfully", time: "1h ago", init: "RP" },
  { label: "Settings updated", time: "2h ago", init: "ST" },
];

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [open, setOpen] = useState(true);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "'Roboto', system-ui, sans-serif", background: "#FFFBFE" }}
    >
      {/* MD3 Navigation Drawer */}
      {open && (
        <nav
          className="flex flex-col w-60 h-full flex-shrink-0 py-3"
          style={{ background: "#FFFBFE", borderRight: "1px solid #E7E0EC" }}
        >
          <div className="flex items-center gap-3 px-5 py-4 mb-1">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "#6750A4" }}
            >
              <span className="text-white text-sm font-medium">B</span>
            </div>
            <span className="font-medium text-base" style={{ color: "#1C1B1F" }}>
              Beomz App
            </span>
          </div>

          {NAV_ITEMS.map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="flex items-center gap-3 mx-3 px-4 py-3 rounded-full transition-colors text-left"
              style={{
                background: active === id ? "#E8DEF8" : "transparent",
                color: active === id ? "#21005D" : "#49454F",
              }}
            >
              <Icon
                size={20}
                style={{ color: active === id ? "#6750A4" : "#49454F" }}
              />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* MD3 Top App Bar */}
        <header
          className="flex items-center gap-2 px-3 h-16 flex-shrink-0"
          style={{ background: "#FFFBFE", borderBottom: "1px solid #E7E0EC" }}
        >
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-full transition-colors"
            style={{ color: "#1C1B1F" }}
          >
            <Menu size={22} />
          </button>
          <h1 className="flex-1 text-xl font-medium pl-1" style={{ color: "#1C1B1F" }}>
            {NAV_ITEMS.find((n) => n.id === active)?.label ?? "App"}
          </h1>
          <button className="p-2 rounded-full" style={{ color: "#1C1B1F" }}>
            <Search size={20} />
          </button>
          <button className="p-2 rounded-full" style={{ color: "#1C1B1F" }}>
            <Bell size={20} />
          </button>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-auto p-6">
          {/* Metric cards with tonal elevation */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {CARDS.map((c) => (
              <div
                key={c.title}
                className="rounded-xl p-5"
                style={{
                  background: "#FFFFFF",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <p className="text-sm font-medium mb-1" style={{ color: "#49454F" }}>
                  {c.title}
                </p>
                <p className="text-3xl font-normal mb-1" style={{ color: "#1C1B1F" }}>
                  {c.value}
                </p>
                <p className="text-xs" style={{ color: "#79747E" }}>
                  {c.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Activity list card */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "#FFFFFF",
              boxShadow: "0 1px 2px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium" style={{ color: "#1C1B1F" }}>
                Recent Activity
              </h2>
              <button
                className="flex items-center gap-1 text-sm font-medium"
                style={{ color: "#6750A4" }}
              >
                View all <ChevronRight size={14} />
              </button>
            </div>

            {ACTIVITY.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-3"
                style={{ borderBottom: i < ACTIVITY.length - 1 ? "1px solid #E7E0EC" : "none" }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "#E8DEF8" }}
                >
                  <span className="text-xs font-medium" style={{ color: "#6750A4" }}>
                    {item.init}
                  </span>
                </div>
                <span className="flex-1 text-sm" style={{ color: "#49454F" }}>
                  {item.label}
                </span>
                <span className="text-xs" style={{ color: "#79747E" }}>
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* MD3 FAB */}
      <button
        className="fixed bottom-6 right-6 flex items-center justify-center w-14 h-14 rounded-2xl"
        style={{
          background: "#6750A4",
          boxShadow: "0 3px 12px rgba(103,80,164,0.4)",
          color: "#FFFFFF",
        }}
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
`,
  },
];
