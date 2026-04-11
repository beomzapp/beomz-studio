import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";

const SERVICES = [
  { name: "API", status: "operational", uptime: "99.98%" },
  { name: "Web Application", status: "operational", uptime: "99.95%" },
  { name: "Database", status: "operational", uptime: "99.99%" },
  { name: "CDN / Static Assets", status: "degraded", uptime: "99.82%" },
  { name: "Email Service", status: "operational", uptime: "99.91%" },
  { name: "Background Jobs", status: "operational", uptime: "99.96%" },
  { name: "Search", status: "operational", uptime: "99.93%" },
];

const INCIDENTS = [
  { id: 1, title: "CDN latency increase in EU region", status: "investigating", severity: "minor", date: "April 10, 2024 — 14:23 UTC", updates: [
    { time: "14:23 UTC", text: "We are investigating increased latency for static assets in the EU region." },
    { time: "14:45 UTC", text: "Root cause identified as a configuration change. Rolling back." },
  ]},
  { id: 2, title: "Scheduled maintenance: Database migration", status: "resolved", severity: "maintenance", date: "April 8, 2024 — 02:00 UTC", updates: [
    { time: "02:00 UTC", text: "Starting scheduled database migration. Expect brief read-only period." },
    { time: "02:18 UTC", text: "Migration completed successfully. All services operating normally." },
  ]},
  { id: 3, title: "API error rate spike", status: "resolved", severity: "major", date: "April 5, 2024 — 09:12 UTC", updates: [
    { time: "09:12 UTC", text: "Investigating elevated 5xx error rates on the API." },
    { time: "09:30 UTC", text: "Identified issue with connection pool exhaustion. Scaling up." },
    { time: "09:45 UTC", text: "Fix deployed. Error rates returning to normal." },
    { time: "10:00 UTC", text: "Resolved. All systems operating normally. Post-mortem to follow." },
  ]},
];

const STATUS_CONFIG = {
  operational: { icon: CheckCircle2, label: "Operational", color: "text-green-600", bg: "bg-green-50", dot: "bg-green-500" },
  degraded: { icon: AlertTriangle, label: "Degraded", color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  outage: { icon: XCircle, label: "Major Outage", color: "text-red-600", bg: "bg-red-50", dot: "bg-red-500" },
};

const SEVERITY_CONFIG = {
  minor: { label: "Minor", color: "bg-amber-50 text-amber-600 border-amber-200" },
  major: { label: "Major", color: "bg-red-50 text-red-600 border-red-200" },
  maintenance: { label: "Maintenance", color: "bg-blue-50 text-blue-600 border-blue-200" },
};

const INCIDENT_STATUS = {
  investigating: { label: "Investigating", color: "bg-amber-50 text-amber-600" },
  identified: { label: "Identified", color: "bg-blue-50 text-blue-600" },
  resolved: { label: "Resolved", color: "bg-green-50 text-green-600" },
};

export function App() {
  const [expanded, setExpanded] = useState(new Set([1]));

  const allOperational = SERVICES.every((s) => s.status === "operational");
  const overallStatus = allOperational ? STATUS_CONFIG.operational : STATUS_CONFIG.degraded;
  const OverallIcon = overallStatus.icon;

  const toggleExpanded = (id) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const UPTIME_BARS = Array.from({ length: 30 }, (_, i) => i === 22 || i === 27 ? "degraded" : i === 15 ? "outage" : "operational");

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className={"border-b border-gray-200 " + overallStatus.bg}>
        <div className="max-w-2xl mx-auto px-6 py-8 text-center">
          <OverallIcon size={32} className={overallStatus.color + " mx-auto mb-3"} />
          <h1 className="text-2xl font-bold text-[#111827] mb-1">{allOperational ? "All Systems Operational" : "Partial System Degradation"}</h1>
          <p className="text-sm text-[#6b7280]">Updated just now</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#111827] mb-4">Services</h2>
          <div className="space-y-3">
            {SERVICES.map((svc) => {
              const cfg = STATUS_CONFIG[svc.status];
              const Icon = cfg.icon;
              return (
                <div key={svc.name} className="flex items-center justify-between">
                  <span className="text-sm text-[#374151]">{svc.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#6b7280]">{svc.uptime}</span>
                    <Icon size={16} className={cfg.color} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#111827] mb-3">30-Day Uptime</h2>
          <div className="flex gap-0.5 h-8">
            {UPTIME_BARS.map((status, i) => (
              <div key={i} className={"flex-1 rounded-sm " + (status === "operational" ? "bg-green-400" : status === "degraded" ? "bg-amber-400" : "bg-red-400")} title={"Day " + (i + 1) + ": " + status} />
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-[#6b7280]">
            <span>30 days ago</span><span>Today</span>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-[#111827] mb-3">Incident History</h2>
        <div className="space-y-3">
          {INCIDENTS.map((inc) => {
            const isOpen = expanded.has(inc.id);
            const sev = SEVERITY_CONFIG[inc.severity];
            const st = INCIDENT_STATUS[inc.status];
            return (
              <div key={inc.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => toggleExpanded(inc.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50/50 transition-colors">
                  {isOpen ? <ChevronDown size={14} className="text-[#6b7280]" /> : <ChevronRight size={14} className="text-[#6b7280]" />}
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-[#111827]">{inc.title}</h3>
                    <p className="text-xs text-[#6b7280] mt-0.5">{inc.date}</p>
                  </div>
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium border " + sev.color}>{sev.label}</span>
                  <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + st.color}>{st.label}</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pl-12 space-y-2 border-t border-gray-100 pt-3">
                    {inc.updates.map((u, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-[10px] text-[#6b7280] w-16 flex-shrink-0 font-mono">{u.time}</span>
                        <p className="text-xs text-[#374151]">{u.text}</p>
                      </div>
                    ))}
                  </div>
                )}
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
