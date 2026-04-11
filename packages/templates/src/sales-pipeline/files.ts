import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { DollarSign, TrendingUp, Target, Users, ChevronRight } from "lucide-react";

const STAGES = ["Discovery", "Qualified", "Proposal", "Negotiation", "Closed Won"];
const STAGE_COLOR = { Discovery: "bg-gray-100 text-gray-600", Qualified: "bg-blue-50 text-blue-600", Proposal: "bg-indigo-50 text-indigo-600", Negotiation: "bg-amber-50 text-amber-600", "Closed Won": "bg-green-50 text-green-600" };

const DEALS = [
  { id: 1, name: "Enterprise Platform Deal", company: "Acme Corp", value: 120000, stage: "Negotiation", probability: 80, owner: "Sarah C.", closeDate: "Apr 30" },
  { id: 2, name: "Team License Expansion", company: "TechStart", value: 45000, stage: "Proposal", probability: 60, owner: "Alex R.", closeDate: "May 15" },
  { id: 3, name: "Custom Integration", company: "GlobalFin", value: 85000, stage: "Qualified", probability: 35, owner: "Jordan L.", closeDate: "Jun 1" },
  { id: 4, name: "Annual Renewal", company: "DataFlow", value: 36000, stage: "Closed Won", probability: 100, owner: "Morgan P.", closeDate: "Apr 10" },
  { id: 5, name: "Pilot Program", company: "CloudNine", value: 15000, stage: "Discovery", probability: 15, owner: "Casey K.", closeDate: "May 30" },
  { id: 6, name: "Department Rollout", company: "Pixel Studio", value: 72000, stage: "Proposal", probability: 55, owner: "Sarah C.", closeDate: "May 20" },
  { id: 7, name: "API Partnership", company: "AppWorks", value: 28000, stage: "Qualified", probability: 40, owner: "Alex R.", closeDate: "Jun 15" },
  { id: 8, name: "Startup Bundle", company: "LaunchPad", value: 8000, stage: "Negotiation", probability: 90, owner: "Jordan L.", closeDate: "Apr 20" },
];

const fmt = (n) => "$" + (n >= 1000 ? (n / 1000).toFixed(0) + "k" : n.toLocaleString());
const fmtFull = (n) => "$" + n.toLocaleString();

export function App() {
  const [view, setView] = useState("pipeline");

  const totalPipeline = useMemo(() => DEALS.filter((d) => d.stage !== "Closed Won").reduce((s, d) => s + d.value, 0), []);
  const totalWon = useMemo(() => DEALS.filter((d) => d.stage === "Closed Won").reduce((s, d) => s + d.value, 0), []);
  const weightedForecast = useMemo(() => Math.round(DEALS.reduce((s, d) => s + d.value * (d.probability / 100), 0)), []);
  const avgDealSize = useMemo(() => Math.round(DEALS.reduce((s, d) => s + d.value, 0) / DEALS.length), []);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-lg font-semibold text-[#111827] flex items-center gap-2"><Target size={20} className="text-blue-500" /> Sales Pipeline</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {["pipeline", "forecast", "list"].map((v) => (
              <button key={v} onClick={() => setView(v)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (view === v ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Pipeline", value: fmtFull(totalPipeline), icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Won", value: fmtFull(totalWon), icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
            { label: "Forecast", value: fmtFull(weightedForecast), icon: Target, color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "Avg Deal", value: fmtFull(avgDealSize), icon: Users, color: "text-gray-600", bg: "bg-gray-50" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={"flex h-8 w-8 items-center justify-center rounded-lg mb-2 " + m.bg}><m.icon size={16} className={m.color} /></div>
              <p className="text-2xl font-bold text-[#111827]">{m.value}</p>
              <p className="text-xs text-[#6b7280]">{m.label}</p>
            </div>
          ))}
        </div>

        {view === "pipeline" && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {STAGES.map((stage) => {
              const stageDeals = DEALS.filter((d) => d.stage === stage);
              const stageTotal = stageDeals.reduce((s, d) => s + d.value, 0);
              return (
                <div key={stage} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + STAGE_COLOR[stage]}>{stage}</span>
                    <span className="text-xs text-[#6b7280]">{fmt(stageTotal)}</span>
                  </div>
                  <div className="space-y-2">
                    {stageDeals.map((d) => (
                      <div key={d.id} className="rounded-lg border border-gray-100 p-2.5 hover:border-gray-200 hover:shadow-sm transition-all">
                        <p className="text-xs font-medium text-[#111827] mb-0.5">{d.name}</p>
                        <p className="text-[10px] text-[#6b7280] mb-1.5">{d.company}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-blue-600">{fmtFull(d.value)}</span>
                          <span className="text-[10px] text-[#6b7280]">{d.probability}%</span>
                        </div>
                      </div>
                    ))}
                    {stageDeals.length === 0 && <p className="text-[10px] text-[#6b7280] text-center py-4">No deals</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "forecast" && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-[#111827] mb-4">Weighted Forecast by Stage</h2>
            <div className="space-y-4">
              {STAGES.map((stage) => {
                const stageDeals = DEALS.filter((d) => d.stage === stage);
                const weighted = stageDeals.reduce((s, d) => s + d.value * (d.probability / 100), 0);
                const raw = stageDeals.reduce((s, d) => s + d.value, 0);
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + STAGE_COLOR[stage]}>{stage}</span>
                      <div className="text-right">
                        <span className="text-sm font-medium text-[#111827]">{fmtFull(Math.round(weighted))}</span>
                        <span className="text-xs text-[#6b7280] ml-2">of {fmtFull(raw)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className="h-2 bg-blue-500 rounded-full" style={{ width: (totalPipeline + totalWon > 0 ? (raw / (totalPipeline + totalWon)) * 100 : 0) + "%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Deal</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Company</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Stage</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280] text-right">Value</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280] text-right">Prob.</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Owner</th>
                <th className="px-4 py-3 text-xs font-medium text-[#6b7280]">Close</th>
              </tr></thead>
              <tbody>
                {DEALS.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-[#111827] font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{d.company}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + STAGE_COLOR[d.stage]}>{d.stage}</span></td>
                    <td className="px-4 py-3 text-right text-[#111827] font-medium">{fmtFull(d.value)}</td>
                    <td className="px-4 py-3 text-right text-[#6b7280]">{d.probability}%</td>
                    <td className="px-4 py-3 text-[#6b7280]">{d.owner}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{d.closeDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
