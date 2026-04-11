import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Search, Database, Table, ChevronRight, X } from "lucide-react";

const TABLES = [
  { name: "users", rows: 1247, columns: ["id", "name", "email", "role", "created_at"] },
  { name: "orders", rows: 5832, columns: ["id", "user_id", "total", "status", "created_at"] },
  { name: "products", rows: 342, columns: ["id", "name", "price", "stock", "category"] },
  { name: "invoices", rows: 891, columns: ["id", "order_id", "amount", "paid", "due_date"] },
];

const USERS_DATA = [
  { id: 1, name: "Sarah Chen", email: "sarah@company.co", role: "admin", created_at: "2024-01-15" },
  { id: 2, name: "Alex Rivera", email: "alex@startup.io", role: "user", created_at: "2024-02-03" },
  { id: 3, name: "Jordan Lee", email: "jordan@agency.com", role: "editor", created_at: "2024-02-18" },
  { id: 4, name: "Morgan Park", email: "morgan@freelance.co", role: "user", created_at: "2024-03-01" },
  { id: 5, name: "Casey Kim", email: "casey@dev.io", role: "admin", created_at: "2024-03-12" },
  { id: 6, name: "Taylor Wu", email: "taylor@design.co", role: "editor", created_at: "2024-03-22" },
  { id: 7, name: "Riley Quinn", email: "riley@data.io", role: "user", created_at: "2024-04-01" },
  { id: 8, name: "Avery Smith", email: "avery@cloud.com", role: "user", created_at: "2024-04-05" },
];

const ROLE_COLOR = { admin: "bg-red-50 text-red-600", editor: "bg-blue-50 text-blue-600", user: "bg-gray-100 text-gray-600" };

export function App() {
  const [activeTable, setActiveTable] = useState("users");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);

  const table = TABLES.find((t) => t.name === activeTable);

  const filtered = useMemo(() => {
    if (!search) return USERS_DATA;
    const q = search.toLowerCase();
    return USERS_DATA.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)));
  }, [search]);

  const detail = selectedRow !== null ? USERS_DATA.find((r) => r.id === selectedRow) : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <div className="w-56 bg-white border-r border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold text-[#111827]">Database</span>
        </div>
        <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2">Tables</p>
        <div className="space-y-0.5">
          {TABLES.map((t) => (
            <button key={t.name} onClick={() => { setActiveTable(t.name); setSelectedRow(null); }} className={"w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all " + (activeTable === t.name ? "bg-indigo-50 text-indigo-600 font-medium" : "text-[#374151] hover:bg-gray-50")}>
              <Table size={13} />
              <span className="flex-1">{t.name}</span>
              <span className="text-[10px] text-[#6b7280]">{t.rows}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-[#111827]">{activeTable}</h1>
            <p className="text-xs text-[#6b7280]">{table?.rows} rows · {table?.columns.length} columns</p>
          </div>
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter rows..." className="w-full rounded-lg bg-white border border-gray-200 py-2 pl-9 pr-4 text-[#111827] text-sm placeholder-[#6b7280] outline-none focus:border-indigo-300" />
          </div>
        </div>

        {detail ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#111827]">Record #{detail.id}</h2>
              <button onClick={() => setSelectedRow(null)} className="text-[#6b7280] hover:text-[#111827]"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {Object.entries(detail).map(([key, value]) => (
                <div key={key} className="flex items-center gap-4 py-2 border-b border-gray-50">
                  <span className="text-xs font-mono text-indigo-600 w-28">{key}</span>
                  <span className="text-sm text-[#374151]">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {(table?.columns || []).map((col) => (
                    <th key={col} className="px-4 py-3 text-xs font-medium text-[#6b7280] font-mono">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} onClick={() => setSelectedRow(row.id)} className="border-b border-gray-50 hover:bg-indigo-50/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-[#6b7280] font-mono text-xs">{row.id}</td>
                    <td className="px-4 py-3 text-[#111827] font-medium">{row.name}</td>
                    <td className="px-4 py-3 text-[#6b7280]">{row.email}</td>
                    <td className="px-4 py-3"><span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + (ROLE_COLOR[row.role] || "")}>{row.role}</span></td>
                    <td className="px-4 py-3 text-[#6b7280]">{row.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-center text-sm text-[#6b7280] py-8">No rows match your filter</p>}
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-[#6b7280]">
              Showing {filtered.length} of {USERS_DATA.length} rows
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
