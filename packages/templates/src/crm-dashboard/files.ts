import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Users, DollarSign, TrendingUp, BarChart3, Search, ChevronRight } from "lucide-react";

const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won"];
const STAGE_COLOR = { Lead: "bg-gray-100 text-gray-600", Qualified: "bg-blue-50 text-blue-600", Proposal: "bg-indigo-50 text-indigo-600", Negotiation: "bg-amber-50 text-amber-600", Won: "bg-green-50 text-green-600" };

const DEALS = [
  { id: 1, name: "Acme Corp — Enterprise Plan", contact: "Sarah Chen", value: 48000, stage: "Negotiation", probability: 75 },
  { id: 2, name: "TechStart — Team License", contact: "Alex Rivera", value: 12000, stage: "Proposal", probability: 50 },
  { id: 3, name: "GlobalFin — Custom Integration", contact: "Jordan Lee", value: 85000, stage: "Qualified", probability: 30 },
  { id: 4, name: "Pixel Studio — Pro Plan", contact: "Morgan Park", value: 6000, stage: "Won", probability: 100 },
  { id: 5, name: "DataFlow — Annual Contract", contact: "Casey Kim", value: 36000, stage: "Lead", probability: 15 },
  { id: 6, name: "CloudNine — Expansion", contact: "Taylor Wu", value: 24000, stage: "Proposal", probability: 60 },
];

const CONTACTS = [
  { id: 1, name: "Sarah Chen", company: "Acme Corp", email: "sarah@acme.co", status: "Active" },
  { id: 2, name: "Alex Rivera", company: "TechStart", email: "alex@techstart.io", status: "Active" },
  { id: 3, name: "Jordan Lee", company: "GlobalFin", email: "jordan@globalfin.com", status: "New" },
  { id: 4, name: "Morgan Park", company: "Pixel Studio", email: "morgan@pixel.co", status: "Active" },
  { id: 5, name: "Casey Kim", company: "DataFlow", email: "casey@dataflow.io", status: "New" },
];

const fmt = (n) => "$" + n.toLocaleString();

export function App() {
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");

  const totalPipeline = useMemo(() => DEALS.filter((d) => d.stage !== "Won").reduce((s, d) => s + d.value, 0), []);
  const totalWon = useMemo(() => DEALS.filter((d) => d.stage === "Won").reduce((s, d) => s + d.value, 0), []);
  const forecast = useMemo(() => DEALS.reduce((s, d) => s + d.value * (d.probability / 100), 0), []);

  const filteredContacts = useMemo(() => {
    if (!search) return CONTACTS;
    const q = search.toLowerCase();
    return CONTACTS.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827]">CRM Dashboard</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {["overview", "deals", "contacts"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (tab === t ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Pipeline Value", value: fmt(totalPipeline), icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Won Revenue", value: fmt(totalWon), icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
            { label: "Forecast", value: fmt(Math.round(forecast)), icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "Total Contacts", value: String(CONTACTS.length), icon: Users, color: "text-gray-600", bg: "bg-gray-50" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={"flex h-8 w-8 items-center justify-center rounded-lg " + m.bg}><m.icon size={16} className={m.color} /></div>
              </div>
              <p className="text-2xl font-bold text-[#111827]">{m.value}</p>
              <p className="text-xs text-[#6b7280] mt-1">{m.label}</p>
            </div>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium text-[#111827] mb-4">Pipeline by Stage</h2>
              <div className="space-y-3">
                {STAGES.map((stage) => {
                  const deals = DEALS.filter((d) => d.stage === stage);
                  const value = deals.reduce((s, d) => s + d.value, 0);
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium w-24 text-center " + STAGE_COLOR[stage]}>{stage}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full">
                        <div className="h-2 bg-blue-500 rounded-full" style={{ width: (totalPipeline + totalWon > 0 ? (value / (totalPipeline + totalWon)) * 100 : 0) + "%" }} />
                      </div>
                      <span className="text-sm text-[#374151] w-20 text-right">{fmt(value)}</span>
                      <span className="text-xs text-[#6b7280] w-8">{deals.length}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium text-[#111827] mb-4">Recent Deals</h2>
              <div className="space-y-3">
                {DEALS.slice(0, 4).map((d) => (
                  <div key={d.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#111827] truncate">{d.name}</p>
                      <p className="text-xs text-[#6b7280]">{d.contact}</p>
                    </div>
                    <span className="text-sm font-medium text-[#111827]">{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "deals" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Deal</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Contact</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Stage</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280] text-right">Value</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280] text-right">Prob.</th>
              </tr></thead>
              <tbody>
                {DEALS.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-[#111827] font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{d.contact}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + STAGE_COLOR[d.stage]}>{d.stage}</span></td>
                    <td className="px-4 py-3 text-right text-[#111827]">{fmt(d.value)}</td>
                    <td className="px-4 py-3 text-right text-[#6b7280]">{d.probability}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "contacts" && (
          <div>
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="w-full rounded-lg bg-white border border-gray-200 py-2.5 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Company</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Email</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Status</th>
                </tr></thead>
                <tbody>
                  {filteredContacts.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-[#111827] font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{c.company}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{c.email}</td>
                      <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (c.status === "Active" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600")}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
