import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Search, Inbox, Clock, CheckCircle2, AlertCircle, User } from "lucide-react";

const PRIORITY_COLOR = { Urgent: "bg-red-50 text-red-600 border-red-200", High: "bg-orange-50 text-orange-600 border-orange-200", Medium: "bg-blue-50 text-blue-600 border-blue-200", Low: "bg-gray-100 text-gray-500 border-gray-200" };
const STATUS_COLOR = { Open: "bg-blue-50 text-blue-600", "In Progress": "bg-amber-50 text-amber-600", Resolved: "bg-green-50 text-green-600", Closed: "bg-gray-100 text-gray-500" };

const TICKETS = [
  { id: 1001, subject: "Cannot login after password reset", customer: "Sarah Chen", priority: "Urgent", status: "Open", assignee: "Alex R.", created: "2h ago", responses: 0 },
  { id: 1002, subject: "Billing shows wrong amount for March", customer: "Jordan Lee", priority: "High", status: "In Progress", assignee: "Morgan P.", created: "5h ago", responses: 2 },
  { id: 1003, subject: "Feature request: Dark mode support", customer: "Casey Kim", priority: "Low", status: "Open", assignee: "", created: "1d ago", responses: 0 },
  { id: 1004, subject: "API returns 500 on bulk export", customer: "Taylor Wu", priority: "High", status: "In Progress", assignee: "Alex R.", created: "3h ago", responses: 1 },
  { id: 1005, subject: "How to integrate with Slack?", customer: "Morgan Park", priority: "Medium", status: "Open", assignee: "", created: "6h ago", responses: 0 },
  { id: 1006, subject: "Account deletion request", customer: "Riley Quinn", priority: "Medium", status: "Resolved", assignee: "Morgan P.", created: "2d ago", responses: 3 },
  { id: 1007, subject: "SSO setup not working", customer: "Avery Smith", priority: "Urgent", status: "In Progress", assignee: "Alex R.", created: "1h ago", responses: 1 },
];

export function App() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    let list = TICKETS;
    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (search) list = list.filter((t) => t.subject.toLowerCase().includes(search.toLowerCase()) || t.customer.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [search, statusFilter]);

  const counts = useMemo(() => ({
    open: TICKETS.filter((t) => t.status === "Open").length,
    inProgress: TICKETS.filter((t) => t.status === "In Progress").length,
    resolved: TICKETS.filter((t) => t.status === "Resolved").length,
  }), []);

  const detail = TICKETS.find((t) => t.id === selected);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827] flex items-center gap-2"><Inbox size={20} className="text-blue-500" /> Support Tickets</h1>
          <div className="flex gap-3 text-xs text-[#6b7280]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />{counts.open} Open</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />{counts.inProgress} In Progress</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{counts.resolved} Resolved</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className="w-full rounded-lg bg-white border border-gray-200 py-2.5 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-blue-300" />
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {["All", "Open", "In Progress", "Resolved"].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={"rounded-md px-3 py-1.5 text-xs font-medium transition-all " + (statusFilter === s ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {detail ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-[#6b7280]">#{detail.id}</span>
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium border " + PRIORITY_COLOR[detail.priority]}>{detail.priority}</span>
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + STATUS_COLOR[detail.status]}>{detail.status}</span>
                </div>
                <h2 className="text-base font-medium text-[#111827]">{detail.subject}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#6b7280] hover:text-[#111827] text-xs">Back to list</button>
            </div>
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg mb-4 text-sm">
              <div><span className="text-[#6b7280] text-xs block">Customer</span><span className="text-[#111827] font-medium">{detail.customer}</span></div>
              <div><span className="text-[#6b7280] text-xs block">Assignee</span><span className="text-[#111827] font-medium">{detail.assignee || "Unassigned"}</span></div>
              <div><span className="text-[#6b7280] text-xs block">Created</span><span className="text-[#111827]">{detail.created}</span></div>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-[#374151]">Customer reported this issue {detail.created}. {detail.responses > 0 ? detail.responses + " response(s) sent." : "No responses yet."}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280] w-16">ID</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Subject</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Customer</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Priority</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Assignee</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Created</th>
              </tr></thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} onClick={() => setSelected(t.id)} className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer">
                    <td className="px-4 py-3 text-[#6b7280] font-mono text-xs">#{t.id}</td>
                    <td className="px-4 py-3 text-[#111827] font-medium">{t.subject}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{t.customer}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-[10px] font-medium border " + PRIORITY_COLOR[t.priority]}>{t.priority}</span></td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + STATUS_COLOR[t.status]}>{t.status}</span></td>
                    <td className="px-4 py-3 text-[#6b7280]">{t.assignee || "—"}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{t.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-center text-sm text-[#6b7280] py-8">No tickets match your filters</p>}
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
