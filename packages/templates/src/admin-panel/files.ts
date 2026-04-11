import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Users, Shield, Activity, Settings, Search, MoreHorizontal } from "lucide-react";

const ROLES = { Admin: "bg-red-50 text-red-600", Editor: "bg-blue-50 text-blue-600", Viewer: "bg-gray-100 text-gray-600" };

const USERS_DATA = [
  { id: 1, name: "Sarah Chen", email: "sarah@company.co", role: "Admin", status: "Active", lastActive: "Just now" },
  { id: 2, name: "Alex Rivera", email: "alex@company.co", role: "Editor", status: "Active", lastActive: "5 min ago" },
  { id: 3, name: "Jordan Lee", email: "jordan@company.co", role: "Editor", status: "Active", lastActive: "1 hr ago" },
  { id: 4, name: "Morgan Park", email: "morgan@company.co", role: "Viewer", status: "Inactive", lastActive: "3 days ago" },
  { id: 5, name: "Casey Kim", email: "casey@company.co", role: "Admin", status: "Active", lastActive: "12 min ago" },
  { id: 6, name: "Taylor Wu", email: "taylor@company.co", role: "Viewer", status: "Active", lastActive: "2 hr ago" },
  { id: 7, name: "Riley Quinn", email: "riley@company.co", role: "Editor", status: "Suspended", lastActive: "1 week ago" },
];

const ACTIVITY_LOG = [
  { id: 1, user: "Sarah Chen", action: "Updated system settings", time: "2 min ago", type: "settings" },
  { id: 2, user: "Alex Rivera", action: "Created new project", time: "15 min ago", type: "create" },
  { id: 3, user: "Casey Kim", action: "Changed user role: Morgan Park", time: "1 hr ago", type: "user" },
  { id: 4, user: "Jordan Lee", action: "Exported analytics report", time: "2 hr ago", type: "export" },
  { id: 5, user: "Sarah Chen", action: "Added new team member", time: "3 hr ago", type: "user" },
];

export function App() {
  const [tab, setTab] = useState("users");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  const filtered = useMemo(() => {
    let list = USERS_DATA;
    if (roleFilter !== "All") list = list.filter((u) => u.role === roleFilter);
    if (search) list = list.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [search, roleFilter]);

  const initials = (n) => n.split(" ").map((w) => w[0]).join("");
  const statusColor = { Active: "bg-green-50 text-green-600", Inactive: "bg-gray-100 text-gray-500", Suspended: "bg-red-50 text-red-600" };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827] flex items-center gap-2"><Shield size={20} className="text-indigo-500" /> Admin Panel</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {["users", "activity", "settings"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (tab === t ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Users", value: USERS_DATA.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Active", value: USERS_DATA.filter((u) => u.status === "Active").length, icon: Activity, color: "text-green-600", bg: "bg-green-50" },
            { label: "Admins", value: USERS_DATA.filter((u) => u.role === "Admin").length, icon: Shield, color: "text-red-600", bg: "bg-red-50" },
            { label: "Events Today", value: ACTIVITY_LOG.length, icon: Activity, color: "text-indigo-600", bg: "bg-indigo-50" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={"flex h-8 w-8 items-center justify-center rounded-lg mb-2 " + m.bg}><m.icon size={16} className={m.color} /></div>
              <p className="text-2xl font-bold text-[#111827]">{m.value}</p>
              <p className="text-xs text-[#6b7280]">{m.label}</p>
            </div>
          ))}
        </div>

        {tab === "users" && (
          <div>
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="w-full rounded-lg bg-white border border-gray-200 py-2.5 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-indigo-300" />
              </div>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-lg bg-white border border-gray-200 px-3 py-2.5 text-sm text-[#111827] outline-none">
                <option value="All">All Roles</option>
                {Object.keys(ROLES).map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">User</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Last Active</th>
                  <th className="w-10" />
                </tr></thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">{initials(u.name)}</div>
                          <div><p className="text-[#111827] font-medium">{u.name}</p><p className="text-xs text-[#6b7280]">{u.email}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (ROLES[u.role] || "")}>{u.role}</span></td>
                      <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (statusColor[u.status] || "")}>{u.status}</span></td>
                      <td className="px-4 py-3 text-[#6b7280]">{u.lastActive}</td>
                      <td className="px-2"><button className="text-[#6b7280] hover:text-[#111827]"><MoreHorizontal size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-[#111827] mb-4">Activity Log</h2>
            <div className="space-y-4">
              {ACTIVITY_LOG.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-[#6b7280] flex-shrink-0 mt-0.5">{initials(a.user)}</div>
                  <div className="flex-1">
                    <p className="text-sm text-[#111827]"><span className="font-medium">{a.user}</span> {a.action}</p>
                    <p className="text-xs text-[#6b7280]">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-medium text-[#111827] mb-4 flex items-center gap-2"><Settings size={14} /> System Settings</h2>
            <div className="space-y-4">
              {[
                { label: "Two-Factor Authentication", desc: "Require 2FA for all admin users", enabled: true },
                { label: "Email Notifications", desc: "Send email on user role changes", enabled: true },
                { label: "API Access", desc: "Allow external API integrations", enabled: false },
                { label: "Audit Logging", desc: "Log all admin actions", enabled: true },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-[#111827]">{s.label}</p>
                    <p className="text-xs text-[#6b7280]">{s.desc}</p>
                  </div>
                  <div className={"w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors " + (s.enabled ? "bg-indigo-500 justify-end" : "bg-gray-300 justify-start")}>
                    <div className="h-4 w-4 rounded-full bg-white shadow-sm" />
                  </div>
                </div>
              ))}
            </div>
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
