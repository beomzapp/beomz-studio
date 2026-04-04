/** Working styled scaffold for workspace-task template */
export function getWorkspaceFallback(): { path: string; content: string }[] {
  return [
    {
      path: "src/pages/Tasks.tsx",
      content: `export default function Tasks() {
  const tasks = [
    { title: "Design homepage", status: "In Progress", owner: "Alice", due: "Apr 10" },
    { title: "Write API docs", status: "Todo", owner: "Bob", due: "Apr 12" },
    { title: "Setup CI/CD", status: "Done", owner: "Carol", due: "Apr 8" },
  ];
  const statusColor: Record<string, string> = {
    "Todo": "text-white/40",
    "In Progress": "text-orange-400",
    "Done": "text-green-400",
  };
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white">New Task</button>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.title} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
            <div>
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-white/30">{t.owner} · Due {t.due}</p>
            </div>
            <span className={\`text-xs font-medium \${statusColor[t.status] || "text-white/40"}\`}>{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}`,
    },
    {
      path: "src/pages/Board.tsx",
      content: `export default function Board() {
  const columns = [
    { title: "Backlog", items: ["Research competitors", "User interviews"] },
    { title: "In Progress", items: ["Design system", "API integration"] },
    { title: "Done", items: ["Project setup", "Database schema"] },
  ];
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <h1 className="mb-6 text-2xl font-bold">Board</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <div key={col.title} className="rounded-xl border border-white/10 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white/50">{col.title}</h3>
            <div className="space-y-2">
              {col.items.map((item) => (
                <div key={item} className="rounded-lg bg-white/5 px-3 py-2 text-sm">{item}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}`,
    },
    {
      path: "src/pages/Settings.tsx",
      content: `export default function Settings() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <div className="max-w-xl space-y-6">
        <div className="rounded-xl border border-white/10 p-6">
          <h2 className="mb-4 font-semibold">Workspace</h2>
          <input type="text" placeholder="Workspace name" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/30 outline-none" />
        </div>
        <div className="rounded-xl border border-white/10 p-6">
          <h2 className="mb-4 font-semibold">Members</h2>
          <p className="text-sm text-white/40">Invite members to collaborate on tasks.</p>
          <button className="mt-3 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60">Invite Member</button>
        </div>
      </div>
    </div>
  );
}`,
    },
  ];
}
