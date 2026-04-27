import { useState, useEffect, useCallback } from "react";
import { X, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  fetchAdminUsers,
  fetchUserCreditHistory,
  postCreditAdjustment,
  type AdminUser,
  type CreditHistoryEntry,
} from "../lib/api.ts";
import { useAuthToken } from "../lib/useAuthToken.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Plan badge ────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro_starter: "Pro Starter",
  pro_builder: "Pro Builder",
  business: "Business",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  pro_starter: "bg-blue-50 text-blue-700",
  pro_builder: "bg-purple-50 text-purple-700",
  business: "bg-orange-50 text-orange-600",
};

function PlanBadge({ plan }: { plan: string }) {
  const color = PLAN_COLORS[plan] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {PLAN_LABELS[plan] ?? plan}
    </span>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_OPTIONS = [
  { value: "", label: "All Plans" },
  { value: "free", label: "Free" },
  { value: "pro_starter", label: "Pro Starter" },
  { value: "pro_builder", label: "Pro Builder" },
  { value: "business", label: "Business" },
];

const PAGE_LIMIT = 50;

// ── Component ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const token = useAuthToken();

  // Table state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);

  // Slide-over state
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [history, setHistory] = useState<CreditHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Credit adjustment state
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // ── Fetch users ─────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setTableError(null);
    try {
      const data = await fetchAdminUsers(token, {
        search: debouncedSearch || undefined,
        plan: plan || undefined,
        page,
        limit: PAGE_LIMIT,
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch (e) {
      setTableError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [token, debouncedSearch, plan, page]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, plan]);

  // ── Open slide-over ─────────────────────────────────────────────────────────

  async function openUser(user: AdminUser) {
    setSelected(user);
    setDelta("");
    setReason("");
    setAdjustError(null);
    setHistory([]);
    setHistoryLoading(true);
    try {
      if (!token) return;
      const entries = await fetchUserCreditHistory(token, user.id);
      setHistory(entries);
    } catch {
      // history is non-critical — swallow error
    } finally {
      setHistoryLoading(false);
    }
  }

  // ── Credit adjustment ───────────────────────────────────────────────────────

  async function applyAdjustment() {
    if (!selected) return;
    const n = parseInt(delta, 10);
    if (isNaN(n) || n === 0) { setAdjustError("Enter a non-zero integer"); return; }
    if (!reason.trim()) { setAdjustError("Reason is required"); return; }

    setAdjusting(true);
    setAdjustError(null);

    // Optimistic update
    const prev = selected.credits;
    const next = prev + n;
    const applyOptimistic = (val: number) => {
      setSelected(u => (u ? { ...u, credits: val } : u));
      setUsers(list => list.map(u => (u.id === selected.id ? { ...u, credits: val } : u)));
    };
    applyOptimistic(next);

    try {
      if (!token) throw new Error("Not authenticated");
      await postCreditAdjustment(token, selected.id, n, reason.trim());
      // Refresh credit history
      const entries = await fetchUserCreditHistory(token, selected.id);
      setHistory(entries);
      setDelta("");
      setReason("");
    } catch (e) {
      applyOptimistic(prev); // revert
      setAdjustError(e instanceof Error ? e.message : "Failed to apply adjustment");
    } finally {
      setAdjusting(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Users</h2>
          {!loading && (
            <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} total</p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search by email or name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-slate-800 placeholder-slate-400 w-64 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Plan filter */}
          <select
            value={plan}
            onChange={e => setPlan(e.target.value)}
            className="py-2 pl-3 pr-8 text-sm border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            {PLAN_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Plan</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Credits</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Joined</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Last active</th>
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
              ) : tableError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-red-500">
                    {tableError}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr
                    key={user.id}
                    onClick={() => void openUser(user)}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{user.email}</div>
                      {user.full_name && (
                        <div className="text-xs text-slate-400 mt-0.5">{user.full_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={user.plan} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {user.credits.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.last_active)}</td>
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
            Page {page} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} users
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

      {/* ── Slide-over ─────────────────────────────────────────────────────── */}
      {selected && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setSelected(null)}
          />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-xl z-50 flex flex-col border-l border-slate-200">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <h3 className="font-semibold text-slate-800">User Details</h3>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* User info grid */}
              <div className="px-5 py-4 border-b border-slate-100 space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                    Email
                  </p>
                  <p className="text-sm font-medium text-slate-800">{selected.email}</p>
                  {selected.full_name && (
                    <p className="text-xs text-slate-500 mt-0.5">{selected.full_name}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Plan
                    </p>
                    <PlanBadge plan={selected.plan} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Credits
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {selected.credits.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Joined
                    </p>
                    <p className="text-sm text-slate-600">{formatDate(selected.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
                      Org ID
                    </p>
                    <p className="text-xs font-mono text-slate-500 truncate">
                      {selected.org_id ?? "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Credit adjustment */}
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                  Adjust Credits
                </p>

                <div className="flex gap-2 mb-2.5">
                  <input
                    type="number"
                    placeholder="e.g. 100 or -50"
                    value={delta}
                    onChange={e => setDelta(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => void applyAdjustment()}
                    disabled={adjusting}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {adjusting ? "Applying…" : "Apply"}
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Reason (required)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void applyAdjustment(); }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />

                {adjustError && (
                  <p className="text-xs text-red-500 mt-2">{adjustError}</p>
                )}
              </div>

              {/* Credit history */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                  Credit History
                </p>

                {historyLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                    Loading history…
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-sm text-slate-400">No credit history</p>
                ) : (
                  <div className="space-y-1">
                    {history.map(entry => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between py-2 border-b border-slate-50 last:border-b-0"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <p className="text-xs text-slate-700 truncate">{entry.reason}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.created_at)}</p>
                        </div>
                        <span
                          className={`text-sm font-semibold shrink-0 ${
                            entry.delta >= 0 ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {entry.delta >= 0 ? "+" : ""}{entry.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
