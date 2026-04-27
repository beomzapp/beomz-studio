import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchAdminCredits,
  type AdminCreditTransaction,
} from "../lib/api.ts";
import { useAuthToken } from "../lib/useAuthToken.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_STYLES: Record<string, string> = {
  build: "bg-blue-50 text-blue-700",
  referral: "bg-purple-50 text-purple-700",
  manual_admin: "bg-orange-50 text-orange-600",
  stripe: "bg-green-50 text-green-700",
};

const SOURCE_LABELS: Record<string, string> = {
  build: "Build",
  referral: "Referral",
  manual_admin: "Manual Admin",
  stripe: "Stripe",
};

function SourceBadge({ source }: { source: string }) {
  const style = SOURCE_STYLES[source] ?? "bg-slate-100 text-slate-600";
  const label = SOURCE_LABELS[source] ?? source;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "build", label: "Build" },
  { value: "referral", label: "Referral" },
  { value: "manual_admin", label: "Manual Admin" },
  { value: "stripe", label: "Stripe" },
];

const PAGE_LIMIT = 50;

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreditsPage() {
  const token = useAuthToken();

  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);

  const [transactions, setTransactions] = useState<AdminCreditTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminCredits(token, {
        source: source || undefined,
        page,
        limit: PAGE_LIMIT,
      });
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load credit ledger");
    } finally {
      setLoading(false);
    }
  }, [token, source, page]);

  useEffect(() => { void load(); }, [load]);

  // Reset page when source filter changes
  useEffect(() => { setPage(1); }, [source]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Credit Ledger</h2>
          {!loading && (
            <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} transactions</p>
          )}
        </div>

        {/* Source filter */}
        <select
          value={source}
          onChange={e => setSource(e.target.value)}
          className="py-2 pl-3 pr-8 text-sm border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        >
          {SOURCE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                  User
                </th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Delta
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Source
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Reason
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                      <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      Loading…
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-red-500">
                    {error}
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map(tx => (
                  <tr
                    key={tx.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-700 truncate max-w-[220px]">
                      {tx.user_email}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold font-mono text-sm ${
                          tx.delta >= 0 ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {tx.delta >= 0 ? "+" : ""}{tx.delta.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={tx.source} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm max-w-[300px] truncate">
                      {tx.reason}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {formatDate(tx.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} transactions
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
