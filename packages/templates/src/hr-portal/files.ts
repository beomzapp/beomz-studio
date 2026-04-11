import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Users, Calendar, Building2, Search, Clock, CheckCircle2, XCircle } from "lucide-react";

const DEPARTMENTS = ["Engineering", "Design", "Marketing", "Sales", "Operations"];
const DEPT_COLOR = { Engineering: "bg-blue-50 text-blue-600", Design: "bg-purple-50 text-purple-600", Marketing: "bg-green-50 text-green-600", Sales: "bg-amber-50 text-amber-600", Operations: "bg-gray-100 text-gray-600" };

const EMPLOYEES = [
  { id: 1, name: "Sarah Chen", role: "Senior Engineer", dept: "Engineering", email: "sarah@company.co", joined: "Jan 2023", status: "Active" },
  { id: 2, name: "Alex Rivera", role: "Product Designer", dept: "Design", email: "alex@company.co", joined: "Mar 2023", status: "Active" },
  { id: 3, name: "Jordan Lee", role: "Marketing Lead", dept: "Marketing", email: "jordan@company.co", joined: "Jun 2022", status: "Active" },
  { id: 4, name: "Morgan Park", role: "Sales Rep", dept: "Sales", email: "morgan@company.co", joined: "Sep 2023", status: "Active" },
  { id: 5, name: "Casey Kim", role: "DevOps Engineer", dept: "Engineering", email: "casey@company.co", joined: "Nov 2023", status: "Active" },
  { id: 6, name: "Taylor Wu", role: "Operations Manager", dept: "Operations", email: "taylor@company.co", joined: "Feb 2022", status: "On Leave" },
];

const LEAVE_REQUESTS = [
  { id: 1, employee: "Sarah Chen", type: "Vacation", from: "Apr 15", to: "Apr 19", status: "Pending", days: 5 },
  { id: 2, employee: "Alex Rivera", type: "Sick Leave", from: "Apr 10", to: "Apr 11", status: "Approved", days: 2 },
  { id: 3, employee: "Jordan Lee", type: "Personal", from: "Apr 22", to: "Apr 22", status: "Pending", days: 1 },
];

export function App() {
  const [tab, setTab] = useState("employees");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");

  const filtered = useMemo(() => {
    let list = EMPLOYEES;
    if (deptFilter !== "All") list = list.filter((e) => e.dept === deptFilter);
    if (search) list = list.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [search, deptFilter]);

  const deptCounts = useMemo(() => {
    const map = {};
    for (const e of EMPLOYEES) map[e.dept] = (map[e.dept] || 0) + 1;
    return map;
  }, []);

  const initials = (name) => name.split(" ").map((n) => n[0]).join("");
  const leaveStatusColor = { Pending: "bg-amber-50 text-amber-600", Approved: "bg-green-50 text-green-600", Rejected: "bg-red-50 text-red-600" };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827] flex items-center gap-2"><Building2 size={20} className="text-blue-500" /> HR Portal</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {["employees", "leave", "departments"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (tab === t ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Users size={16} className="text-blue-500 mb-2" />
            <p className="text-2xl font-bold text-[#111827]">{EMPLOYEES.length}</p>
            <p className="text-xs text-[#6b7280]">Total Employees</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Building2 size={16} className="text-indigo-500 mb-2" />
            <p className="text-2xl font-bold text-[#111827]">{DEPARTMENTS.length}</p>
            <p className="text-xs text-[#6b7280]">Departments</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Clock size={16} className="text-amber-500 mb-2" />
            <p className="text-2xl font-bold text-[#111827]">{LEAVE_REQUESTS.filter((l) => l.status === "Pending").length}</p>
            <p className="text-xs text-[#6b7280]">Pending Requests</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Calendar size={16} className="text-green-500 mb-2" />
            <p className="text-2xl font-bold text-[#111827]">{EMPLOYEES.filter((e) => e.status === "On Leave").length}</p>
            <p className="text-xs text-[#6b7280]">On Leave</p>
          </div>
        </div>

        {tab === "employees" && (
          <div>
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees..." className="w-full rounded-lg bg-white border border-gray-200 py-2.5 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-blue-300" />
              </div>
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded-lg bg-white border border-gray-200 px-3 py-2.5 text-sm text-[#111827] outline-none">
                <option value="All">All Departments</option>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Employee</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Department</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Joined</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Status</th>
                </tr></thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">{initials(e.name)}</div>
                          <div><p className="text-[#111827] font-medium">{e.name}</p><p className="text-xs text-[#6b7280]">{e.email}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#374151]">{e.role}</td>
                      <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (DEPT_COLOR[e.dept] || "")}>{e.dept}</span></td>
                      <td className="px-4 py-3 text-[#6b7280]">{e.joined}</td>
                      <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (e.status === "Active" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>{e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "leave" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Employee</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Type</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Period</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Days</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Status</th>
              </tr></thead>
              <tbody>
                {LEAVE_REQUESTS.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-[#111827] font-medium">{l.employee}</td>
                    <td className="px-4 py-3 text-[#374151]">{l.type}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{l.from} — {l.to}</td>
                    <td className="px-4 py-3 text-[#374151]">{l.days}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (leaveStatusColor[l.status] || "")}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "departments" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DEPARTMENTS.map((dept) => (
              <div key={dept} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + (DEPT_COLOR[dept] || "")}>{dept}</span>
                  <span className="text-lg font-bold text-[#111827]">{deptCounts[dept] || 0}</span>
                </div>
                <div className="space-y-2">
                  {EMPLOYEES.filter((e) => e.dept === dept).map((e) => (
                    <div key={e.id} className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-[#6b7280]">{initials(e.name)}</div>
                      <div><p className="text-xs text-[#111827]">{e.name}</p><p className="text-[10px] text-[#6b7280]">{e.role}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
