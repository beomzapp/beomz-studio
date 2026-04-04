/** Working styled scaffold for saas-dashboard template */
export function getSaasFallback(): { path: string; content: string }[] {
  return [
    {
      path: "src/pages/Overview.tsx",
      content: `export default function Overview() {
  const metrics = [
    { label: "Total Revenue", value: "$12,450", change: "+8.2%" },
    { label: "Active Users", value: "1,243", change: "+12.5%" },
    { label: "Conversion Rate", value: "3.2%", change: "+0.4%" },
    { label: "Avg. Session", value: "4m 32s", change: "-0.8%" },
  ];
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-white/10 p-5">
            <p className="text-sm text-white/40">{m.label}</p>
            <p className="mt-1 text-2xl font-bold">{m.value}</p>
            <p className="mt-1 text-xs text-orange-400">{m.change}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border border-white/10 p-6">
        <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
        <div className="space-y-3 text-sm text-white/50">
          <p>• New user signed up — 2 minutes ago</p>
          <p>• Payment received — $49.00 — 15 minutes ago</p>
          <p>• Report exported — 1 hour ago</p>
        </div>
      </div>
    </div>
  );
}`,
    },
    {
      path: "src/pages/Customers.tsx",
      content: `export default function Customers() {
  const customers = [
    { name: "Acme Corp", plan: "Pro", status: "Active" },
    { name: "Globex Inc", plan: "Enterprise", status: "Active" },
    { name: "Initech", plan: "Free", status: "Trial" },
  ];
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <h1 className="mb-6 text-2xl font-bold">Customers</h1>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-left text-white/40">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.name} className="border-b border-white/5">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-white/50">{c.plan}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <h2 className="mb-4 font-semibold">Profile</h2>
          <div className="space-y-3">
            <input type="text" placeholder="Company name" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/30 outline-none" />
            <input type="email" placeholder="Email" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/30 outline-none" />
          </div>
        </div>
        <div className="rounded-xl border border-white/10 p-6">
          <h2 className="mb-4 font-semibold">Preferences</h2>
          <label className="flex items-center gap-3 text-sm text-white/60">
            <input type="checkbox" className="accent-orange-500" />
            Email notifications
          </label>
        </div>
      </div>
    </div>
  );
}`,
    },
  ];
}
