import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { LayoutDashboard, ArrowUpRight, ArrowDownRight, CreditCard, Users, Settings, Search, Bell, ChevronRight, TrendingUp } from "lucide-react";

const NAV = [
  { icon: LayoutDashboard, label: "Overview", id: "overview" },
  { icon: CreditCard, label: "Payments", id: "payments" },
  { icon: Users, label: "Customers", id: "customers" },
  { icon: TrendingUp, label: "Analytics", id: "analytics" },
  { icon: Settings, label: "Settings", id: "settings" },
];

const METRICS = [
  { label: "Gross volume", value: "$24,513.00", delta: "+14.2%", up: true },
  { label: "Net revenue", value: "$18,302.50", delta: "+9.8%", up: true },
  { label: "Active customers", value: "1,482", delta: "-2.1%", up: false },
  { label: "Failed charges", value: "23", delta: "+4 today", up: false },
];

const TRANSACTIONS = [
  { id: "pi_3Qa1", amount: "$1,200.00", customer: "Acme Corp", method: "Visa ···4242", status: "succeeded", time: "2m ago" },
  { id: "pi_3Qa2", amount: "$850.00", customer: "TechFlow Inc", method: "Mastercard ···5555", status: "succeeded", time: "8m ago" },
  { id: "pi_3Qa3", amount: "$3,450.00", customer: "BuildFast LLC", method: "AmEx ···0005", status: "processing", time: "12m ago" },
  { id: "pi_3Qa4", amount: "$299.00", customer: "SaaSify", method: "Visa ···1234", status: "failed", time: "41m ago" },
  { id: "pi_3Qa5", amount: "$6,000.00", customer: "Enterprise Co.", method: "Wire transfer", status: "succeeded", time: "1h ago" },
];

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  succeeded: { bg: "#ECFDF5", color: "#065F46" },
  processing: { bg: "#FFF7ED", color: "#9A3412" },
  failed: { bg: "#FEF2F2", color: "#991B1B" },
};

export default function App() {
  const [active, setActive] = useState("overview");

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#F6F9FC" }}
    >
      {/* Stripe-style dark navy sidebar */}
      <nav
        className="flex flex-col w-56 h-full flex-shrink-0 py-4"
        style={{ background: "#1A1F36", flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-3 mb-4">
          <div
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: "#635BFF" }}
          >
            <span className="text-white text-xs font-bold">B</span>
          </div>
          <span className="font-semibold text-sm" style={{ color: "#FFFFFF" }}>
            Beomz Payments
          </span>
        </div>

        {NAV.map(({ icon: Icon, label, id }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className="flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded-lg transition-colors text-left"
            style={{
              background: active === id ? "rgba(255,255,255,0.08)" : "transparent",
              color: active === id ? "#FFFFFF" : "#8792A2",
            }}
          >
            <Icon size={15} />
            <span className="text-[13px] font-medium">{label}</span>
          </button>
        ))}

        {/* Bottom section */}
        <div className="mt-auto mx-2 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "#635BFF" }}
            >
              <span className="text-white text-[11px] font-medium">BZ</span>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium truncate" style={{ color: "#FFFFFF" }}>
                Omar Fareda
              </p>
              <p className="text-[11px] truncate" style={{ color: "#8792A2" }}>
                Admin
              </p>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content — light background */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: "#F6F9FC" }}>
        {/* Topbar */}
        <header
          className="flex items-center gap-3 px-6 h-14 flex-shrink-0"
          style={{ background: "#FFFFFF", borderBottom: "1px solid #E3E8EF" }}
        >
          <h1 className="flex-1 text-base font-semibold" style={{ color: "#1A1F36" }}>
            {NAV.find((n) => n.id === active)?.label ?? "Overview"}
          </h1>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
            style={{ background: "#F6F9FC", border: "1px solid #E3E8EF", color: "#697386" }}
          >
            <Search size={14} />
            <span>Search…</span>
            <kbd className="text-[11px] px-1 rounded" style={{ background: "#E3E8EF", color: "#697386" }}>⌘K</kbd>
          </div>
          <button className="p-2 rounded-lg" style={{ color: "#697386" }}>
            <Bell size={16} />
          </button>
        </header>

        {/* Scrollable page */}
        <main className="flex-1 overflow-auto px-6 py-6">
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {METRICS.map((m) => (
              <div
                key={m.label}
                className="rounded-lg p-4"
                style={{ background: "#FFFFFF", border: "1px solid #E3E8EF" }}
              >
                <p className="text-sm mb-2" style={{ color: "#697386" }}>
                  {m.label}
                </p>
                <p className="text-xl font-semibold mb-1" style={{ color: "#1A1F36" }}>
                  {m.value}
                </p>
                <div className="flex items-center gap-1">
                  {m.up ? (
                    <ArrowUpRight size={14} style={{ color: "#09825D" }} />
                  ) : (
                    <ArrowDownRight size={14} style={{ color: "#C0392B" }} />
                  )}
                  <span
                    className="text-xs font-medium"
                    style={{ color: m.up ? "#09825D" : "#C0392B" }}
                  >
                    {m.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Transactions table */}
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: "#FFFFFF", border: "1px solid #E3E8EF" }}
          >
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid #E3E8EF" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#1A1F36" }}>
                Recent transactions
              </h2>
              <button
                className="flex items-center gap-1 text-sm"
                style={{ color: "#635BFF" }}
              >
                View all <ChevronRight size={14} />
              </button>
            </div>

            {/* Table header */}
            <div
              className="grid grid-cols-12 gap-3 px-5 py-2.5 text-xs font-medium uppercase tracking-wide"
              style={{ background: "#F9FAFC", color: "#697386", borderBottom: "1px solid #E3E8EF" }}
            >
              <span className="col-span-2">ID</span>
              <span className="col-span-2">Amount</span>
              <span className="col-span-3">Customer</span>
              <span className="col-span-2">Method</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-1">Time</span>
            </div>

            {TRANSACTIONS.map((tx, i) => (
              <div
                key={tx.id}
                className="grid grid-cols-12 gap-3 items-center px-5 py-3.5 hover:bg-[#F9FAFC] cursor-pointer"
                style={{ borderBottom: i < TRANSACTIONS.length - 1 ? "1px solid #F3F4F6" : "none" }}
              >
                <span className="col-span-2 font-mono text-xs" style={{ color: "#9EA3AE" }}>
                  {tx.id}
                </span>
                <span className="col-span-2 text-sm font-medium" style={{ color: "#1A1F36" }}>
                  {tx.amount}
                </span>
                <span className="col-span-3 text-sm" style={{ color: "#1A1F36" }}>
                  {tx.customer}
                </span>
                <span className="col-span-2 text-sm" style={{ color: "#697386" }}>
                  {tx.method}
                </span>
                <span className="col-span-2">
                  <span
                    className="text-xs font-medium px-2 py-1 rounded-full capitalize"
                    style={{
                      background: STATUS_STYLES[tx.status]?.bg ?? "#F3F4F6",
                      color: STATUS_STYLES[tx.status]?.color ?? "#374151",
                    }}
                  >
                    {tx.status}
                  </span>
                </span>
                <span className="col-span-1 text-xs" style={{ color: "#9EA3AE" }}>
                  {tx.time}
                </span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
`,
  },
];
