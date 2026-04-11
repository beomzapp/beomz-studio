import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { ChevronDown, ChevronRight, Plus, Search, Calendar, Users, LayoutGrid, Settings, Circle, CheckCircle2 } from "lucide-react";

const SIDEBAR_PROJECTS = [
  { label: "Product Launch", id: "launch", color: "#F06A6A" },
  { label: "Engineering Sprint", id: "sprint", color: "#4573D2" },
  { label: "Design System", id: "design", color: "#9B59B6" },
];

const TASKS = [
  { id: 1, title: "Finalize Q3 product roadmap", assignee: "Sarah C.", due: "Tomorrow", priority: "high", done: false, section: "launch" },
  { id: 2, title: "Review pull requests from backend team", assignee: "Alex R.", due: "Today", priority: "urgent", done: false, section: "sprint" },
  { id: 3, title: "Update design tokens documentation", assignee: "Jordan L.", due: "Nov 15", priority: "medium", done: false, section: "design" },
  { id: 4, title: "Create user onboarding email sequence", assignee: "Morgan P.", due: "Nov 18", priority: "low", done: true, section: "launch" },
  { id: 5, title: "Set up automated testing pipeline", assignee: "Alex R.", due: "Nov 20", priority: "high", done: false, section: "sprint" },
  { id: 6, title: "Conduct team retrospective", assignee: "Sarah C.", due: "Friday", priority: "medium", done: false, section: "sprint" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#E11D48",
  high: "#F06A6A",
  medium: "#4573D2",
  low: "#9CA3AF",
};

export default function App() {
  const [active, setActive] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tasks, setTasks] = useState(TASKS);

  const toggleTask = (id: number) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  };

  const shown = active === "all" ? tasks : tasks.filter((t) => t.section === active);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#FFFFFF" }}
    >
      {/* Asana-style sidebar */}
      {sidebarOpen && (
        <nav
          className="flex flex-col w-60 h-full flex-shrink-0 py-3"
          style={{ background: "#F6F8F9", borderRight: "1px solid #E2E8F0" }}
        >
          {/* Brand */}
          <div className="flex items-center gap-2 px-4 py-3 mb-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "#F06A6A" }}
            >
              <span className="text-white text-xs font-bold">B</span>
            </div>
            <span className="font-semibold text-sm" style={{ color: "#1A202C" }}>Beomz Workspace</span>
          </div>

          {/* Nav items */}
          {[
            { icon: LayoutGrid, label: "My Tasks", id: "all" },
            { icon: Calendar, label: "Calendar", id: "calendar" },
            { icon: Users, label: "Team", id: "team" },
            { icon: Settings, label: "Settings", id: "settings" },
          ].map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-lg transition-colors text-left"
              style={{
                background: active === id ? "#EAEEF5" : "transparent",
                color: active === id ? "#1A202C" : "#4A5568",
              }}
            >
              <Icon size={16} style={{ color: active === id ? "#F06A6A" : "#718096" }} />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}

          {/* Projects section */}
          <div className="mt-4 px-2">
            <button className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#718096]">
              <ChevronDown size={12} />
              Projects
            </button>
            {SIDEBAR_PROJECTS.map((p) => (
              <button
                key={p.id}
                onClick={() => setActive(p.id)}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-colors text-left"
                style={{
                  background: active === p.id ? "#EAEEF5" : "transparent",
                  color: active === p.id ? "#1A202C" : "#4A5568",
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: p.color }}
                />
                <span className="text-sm truncate">{p.label}</span>
              </button>
            ))}
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm"
              style={{ color: "#718096" }}
            >
              <Plus size={14} />
              New project
            </button>
          </div>
        </nav>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-6 h-14 flex-shrink-0" style={{ borderBottom: "1px solid #E2E8F0" }}>
          <button onClick={() => setSidebarOpen((v) => !v)} className="p-1 rounded" style={{ color: "#718096" }}>
            <ChevronRight size={18} style={{ transform: sidebarOpen ? "rotate(180deg)" : "none" }} />
          </button>
          <h1 className="flex-1 text-lg font-semibold" style={{ color: "#1A202C" }}>
            {active === "all" ? "My Tasks" : SIDEBAR_PROJECTS.find((p) => p.id === active)?.label ?? "Tasks"}
          </h1>
          <button className="p-2 rounded-lg" style={{ color: "#718096" }}><Search size={16} /></button>
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#F06A6A", color: "#FFFFFF" }}
          >
            <Plus size={14} />
            Add task
          </button>
        </header>

        {/* Task list */}
        <main className="flex-1 overflow-auto px-6 py-4">
          <div className="max-w-3xl">
            {/* Column headers */}
            <div
              className="grid grid-cols-12 gap-3 pb-2 mb-1 text-xs font-medium uppercase tracking-wide"
              style={{ color: "#718096" }}
            >
              <span className="col-span-5">Task name</span>
              <span className="col-span-2">Assignee</span>
              <span className="col-span-2">Due date</span>
              <span className="col-span-2">Priority</span>
            </div>

            {shown.map((task) => (
              <div
                key={task.id}
                className="grid grid-cols-12 gap-3 items-center py-2.5 group cursor-pointer"
                style={{ borderBottom: "1px solid #EDF2F7" }}
              >
                {/* Checkbox + title */}
                <div className="col-span-5 flex items-center gap-2.5">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className="flex-shrink-0"
                    style={{ color: task.done ? "#F06A6A" : "#CBD5E0" }}
                  >
                    {task.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  </button>
                  <span
                    className="text-sm truncate"
                    style={{
                      color: task.done ? "#A0AEC0" : "#1A202C",
                      textDecoration: task.done ? "line-through" : "none",
                    }}
                  >
                    {task.title}
                  </span>
                </div>

                {/* Assignee */}
                <div className="col-span-2 flex items-center gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                    style={{ background: "#E2E8F0", color: "#4A5568" }}
                  >
                    {task.assignee.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <span className="text-xs truncate" style={{ color: "#718096" }}>
                    {task.assignee}
                  </span>
                </div>

                {/* Due date */}
                <span className="col-span-2 text-sm" style={{ color: "#718096" }}>
                  {task.due}
                </span>

                {/* Priority badge */}
                <div className="col-span-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                    style={{
                      background: PRIORITY_COLORS[task.priority] + "18",
                      color: PRIORITY_COLORS[task.priority],
                    }}
                  >
                    {task.priority}
                  </span>
                </div>
              </div>
            ))}

            {/* Add task inline */}
            <button
              className="flex items-center gap-2 py-2.5 text-sm w-full"
              style={{ color: "#A0AEC0" }}
            >
              <Plus size={14} />
              Add a task…
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
`,
  },
];
