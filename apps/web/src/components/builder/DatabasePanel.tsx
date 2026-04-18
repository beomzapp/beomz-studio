/**
 * DatabasePanel — V2 database management panel.
 *
 * Three panel states driven by project DB fields:
 *   1. Not connected (database_enabled = false) → enable / BYO connect
 *   2. Connected, not wired (database_enabled = true, db_wired = false) → wire CTA
 *   3. Fully wired (db_wired = true) → three-mode layout (Shared / Dedicated / BYO)
 *
 * BEO-400: Three-mode layout with upsell surface, storage usage bar, plan badge.
 * BEO-403: Storage bar always visible; Data tab 404 fix; Shared tab cleanup.
 * BEO-289: Schema tab renders table.table_name; Data tab select populated from table_name.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Link2,
  X,
  MessageSquare,
  Table2,
  Layers,
  ScrollText,
  HardDrive,
  PlugZap,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "../../lib/cn";
import {
  enableDatabase,
  wireDatabase,
  connectDatabase,
  getDbSchema,
  getDbRows,
  runDbMigration,
  getDbUsage,
  getStorageAddons,
  createStorageAddonCheckout,
  type DbTable,
  type StorageAddonInfo,
} from "../../lib/api";

type PanelTab = "schema" | "data" | "bindings" | "logs";
type ModeTab = "shared" | "dedicated" | "byo";

function formatStorageMb(mb: number): string {
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
}

function getPlanBadgeStyle(plan: string): { className: string; dotClass: string; label: string } {
  const normalized = (plan ?? "free").toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "pro_starter":
      return { className: "bg-blue-100 text-blue-700", dotClass: "bg-blue-500", label: "Pro Starter" };
    case "pro_builder":
      return { className: "bg-purple-100 text-purple-700", dotClass: "bg-purple-500", label: "Pro Builder" };
    case "business":
      return { className: "bg-[#F97316]/10 text-[#F97316]", dotClass: "bg-[#F97316]", label: "Business" };
    default:
      return { className: "bg-[#f3f4f6] text-[#6b7280]", dotClass: "bg-[#9ca3af]", label: "Free" };
  }
}

function getPlanStorageLimitMb(plan: string): number {
  const normalized = (plan ?? "free").toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "pro_starter": return 1024;
    case "pro_builder": return 5120;
    case "business": return 15360;
    default: return 200;
  }
}

interface DatabasePanelProps {
  className?: string;
  projectId: string | null;
  databaseEnabled: boolean;
  dbProvider: string | null;
  dbWired: boolean;
  plan: string;
  onDbStateChange: () => void;
}

export function DatabasePanel({
  className,
  projectId,
  databaseEnabled,
  dbProvider,
  dbWired,
  plan,
  onDbStateChange,
}: DatabasePanelProps) {
  const isFree = (plan || "free").toLowerCase() === "free";

  // ── Connection / wiring state ─────────────────────────────
  const [enabling, setEnabling] = useState(false);
  const [wiringDb, setWiringDb] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // BEO-400: DB project limit reached (402 from enable)
  const [dbLimitReached, setDbLimitReached] = useState(false);

  // BYO Supabase modal
  const [showByoModal, setShowByoModal] = useState(false);
  const [byoUrl, setByoUrl] = useState("");
  const [byoAnonKey, setByoAnonKey] = useState("");
  const [byoConnecting, setByoConnecting] = useState(false);

  // ── Mode tabs (BEO-400) ───────────────────────────────────
  const [modeTab, setModeTab] = useState<ModeTab>("shared");

  // ── Storage usage (BEO-400) ──────────────────────────────
  const [dbUsage, setDbUsage] = useState<{ used_mb: number; limits: { storage_mb: number } } | null>(null);
  const [dbUsageLoading, setDbUsageLoading] = useState(false);
  const [dbUsageError, setDbUsageError] = useState(false);

  // BEO-407: Storage add-on tiers fetched from API
  const [addons, setAddons] = useState<StorageAddonInfo[] | null>(null);
  const [addonsLoading, setAddonsLoading] = useState(true);

  // BEO-400: Storage limit reached (402 from migrate)
  const [storageLimitReached, setStorageLimitReached] = useState(false);

  // ── Toast ─────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Inner tabs state ─────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PanelTab>("schema");

  // Schema
  const [schemaTables, setSchemaTables] = useState<DbTable[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  // Data
  const [dataTable, setDataTable] = useState("");
  const [dataRows, setDataRows] = useState<Record<string, unknown>[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataWriteError, setDataWriteError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; column: string } | null>(null);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});

  const selectedTableSchema = useMemo(
    () => schemaTables.find((t) => t.table_name === dataTable) ?? null,
    [schemaTables, dataTable],
  );

  // ── API actions ───────────────────────────────────────────

  const fetchDbUsage = useCallback(async () => {
    if (!projectId) return;
    setDbUsageLoading(true);
    setDbUsageError(false);
    try {
      const data = await getDbUsage(projectId);
      setDbUsage(data);
    } catch {
      setDbUsageError(true);
    } finally {
      setDbUsageLoading(false);
    }
  }, [projectId]);

  const fetchAddons = useCallback(async () => {
    setAddonsLoading(true);
    try {
      const data = await getStorageAddons();
      setAddons(data.filter((a) => a.price_id));
    } catch {
      setAddons([]);
    } finally {
      setAddonsLoading(false);
    }
  }, []);

  const handleEnable = useCallback(async () => {
    if (!projectId) return;
    setEnabling(true);
    setError(null);
    try {
      await enableDatabase(projectId);
      onDbStateChange();
    } catch (err) {
      if (err instanceof Error && err.message === "db_project_limit_reached") {
        setDbLimitReached(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to enable database.");
      }
    } finally {
      setEnabling(false);
    }
  }, [projectId, onDbStateChange]);

  const handleWire = useCallback(async () => {
    if (!projectId) return;
    setWiringDb(true);
    setError(null);
    try {
      await wireDatabase(projectId);
      onDbStateChange();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to wire database.");
    } finally {
      setWiringDb(false);
    }
  }, [projectId, onDbStateChange]);

  const handleByoConnect = useCallback(async () => {
    if (!projectId) return;
    setByoConnecting(true);
    setError(null);
    try {
      await connectDatabase(projectId, { url: byoUrl.trim(), anonKey: byoAnonKey.trim() });
      setShowByoModal(false);
      setByoUrl("");
      setByoAnonKey("");
      onDbStateChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect database.");
    } finally {
      setByoConnecting(false);
    }
  }, [projectId, byoUrl, byoAnonKey, onDbStateChange]);

  const fetchSchema = useCallback(async () => {
    if (!projectId) return;
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const data = await getDbSchema(projectId);
      setSchemaTables(data.tables ?? []);
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : "Failed to load schema.");
    } finally {
      setSchemaLoading(false);
    }
  }, [projectId]);

  const fetchRows = useCallback(async (table: string) => {
    if (!projectId || !table) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const data = await getDbRows(projectId, table);
      setDataRows(data.rows ?? []);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Failed to load rows.");
    } finally {
      setDataLoading(false);
    }
  }, [projectId]);

  const runMigrationSafe = useCallback(async (sql: string) => {
    if (!projectId) return;
    try {
      await runDbMigration(projectId, sql);
    } catch (err) {
      if (err instanceof Error && err.message === "storage_limit_reached") {
        setStorageLimitReached(true);
      }
      throw err;
    }
  }, [projectId]);

  const handleInsertRow = useCallback(async () => {
    if (!projectId || !dataTable) return;
    setDataWriteError(null);
    const cols = selectedTableSchema?.columns ?? [];
    const values = cols
      .filter((c) => c.name !== "id" && c.name !== "created_at" && c.name !== "updated_at")
      .map((c) => `'${(newRow[c.name] ?? "").replace(/'/g, "''")}'`);
    const colNames = cols
      .filter((c) => c.name !== "id" && c.name !== "created_at" && c.name !== "updated_at")
      .map((c) => `"${c.name}"`);
    if (colNames.length === 0) return;
    const sql = `INSERT INTO "${dataTable}" (${colNames.join(", ")}) VALUES (${values.join(", ")});`;
    try {
      await runMigrationSafe(sql);
      setShowAddRowModal(false);
      setNewRow({});
      await fetchRows(dataTable);
    } catch (err) {
      setDataWriteError(err instanceof Error ? err.message : "Failed to add row.");
    }
  }, [projectId, dataTable, selectedTableSchema, newRow, fetchRows, runMigrationSafe]);

  const handleUpdateCell = useCallback(async (rowIdx: number, column: string, value: string) => {
    if (!projectId || !dataTable) return;
    setDataWriteError(null);
    const row = dataRows[rowIdx];
    if (!row) return;
    const pk = row.id ?? row[Object.keys(row)[0]];
    const pkCol = "id" in row ? "id" : Object.keys(row)[0];
    const sql = `UPDATE "${dataTable}" SET "${column}" = '${value.replace(/'/g, "''")}' WHERE "${pkCol}" = '${String(pk).replace(/'/g, "''")}';`;
    try {
      await runMigrationSafe(sql);
      await fetchRows(dataTable);
    } catch (err) {
      setDataWriteError(err instanceof Error ? err.message : "Failed to update cell.");
    }
  }, [projectId, dataTable, dataRows, fetchRows, runMigrationSafe]);

  const handleDeleteRow = useCallback(async (rowIdx: number) => {
    if (!projectId || !dataTable) return;
    const row = dataRows[rowIdx];
    if (!row) return;
    const pk = row.id ?? row[Object.keys(row)[0]];
    const pkCol = "id" in row ? "id" : Object.keys(row)[0];
    const sql = `DELETE FROM "${dataTable}" WHERE "${pkCol}" = '${String(pk).replace(/'/g, "''")}';`;
    setDataWriteError(null);
    try {
      await runMigrationSafe(sql);
      await fetchRows(dataTable);
    } catch (err) {
      setDataWriteError(err instanceof Error ? err.message : "Failed to delete row.");
    }
  }, [projectId, dataTable, dataRows, fetchRows, runMigrationSafe]);

  const handleStorageAddon = useCallback(async (priceId: string) => {
    if (!projectId) return;
    try {
      const { url } = await createStorageAddonCheckout(priceId, projectId);
      window.location.href = url;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to open checkout.");
    }
  }, [projectId, showToast]);

  // Auto-fetch schema when entering wired state
  useEffect(() => {
    if (dbWired && modeTab === "shared" && (activeTab === "schema" || activeTab === "data" || activeTab === "bindings")) {
      void fetchSchema();
    }
  }, [dbWired, modeTab, activeTab, fetchSchema]);

  // Auto-fetch rows when table changes
  useEffect(() => {
    if (dbWired && modeTab === "shared" && activeTab === "data" && dataTable) {
      void fetchRows(dataTable);
    }
  }, [dbWired, modeTab, activeTab, dataTable, fetchRows]);

  // Fetch storage usage + addons on mount and when entering shared mode
  useEffect(() => {
    if (dbWired && modeTab === "shared") {
      void fetchDbUsage();
      void fetchAddons();
    }
  }, [dbWired, modeTab, fetchDbUsage, fetchAddons]);

  const editableCols = useMemo(
    () => (selectedTableSchema?.columns ?? []).filter(
      (c) => c.name !== "id" && c.name !== "created_at" && c.name !== "updated_at",
    ),
    [selectedTableSchema],
  );

  // ── Derived storage values ────────────────────────────────
  const planLimitMb = getPlanStorageLimitMb(plan);
  const usedMb = dbUsage?.used_mb ?? 0;
  const limitMb = dbUsage?.limits.storage_mb ?? planLimitMb;
  const fillPct = limitMb > 0 ? Math.min((usedMb / limitMb) * 100, 100) : 0;
  const barColorClass = fillPct > 90
    ? "bg-red-500"
    : fillPct > 80
      ? "bg-amber-500"
      : "bg-[#F97316]";

  const planBadge = getPlanBadgeStyle(plan);

  // ── STATE 1: Not connected ──────────────────────────────────
  if (!databaseEnabled) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center", className)}>
        <div className="mx-auto w-full max-w-md space-y-6 px-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F97316]/10">
            <Database size={28} className="text-[#F97316]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1a1a1a]">Add a database</h2>
            <p className="mt-1 text-sm text-[#9ca3af]">
              Power your app with live data. Beomz provisions a managed database instantly.
            </p>
          </div>

          {/* DB project limit reached state */}
          {dbLimitReached ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
              <p className="text-sm font-semibold text-amber-800">
                You already have a database on another project.
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Each plan includes 1 shared database.
              </p>
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => showToast("Coming soon — dedicated database provisioning")}
                  className="flex w-full items-center justify-between rounded-lg border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] transition-colors hover:border-[#F97316]/40"
                >
                  <span className="flex items-center gap-2">
                    <HardDrive size={14} className="text-[#F97316]" />
                    Add dedicated database <span className="text-[#9ca3af]">$39/month</span>
                  </span>
                  <ArrowUpRight size={14} className="text-[#9ca3af]" />
                </button>
                <button
                  onClick={() => showToast("Coming soon — BYO Supabase OAuth flow")}
                  className="flex w-full items-center justify-between rounded-lg border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] transition-colors hover:border-[#F97316]/40"
                >
                  <span className="flex items-center gap-2">
                    <PlugZap size={14} className="text-[#F97316]" />
                    Connect your own Supabase
                  </span>
                  <ArrowUpRight size={14} className="text-[#9ca3af]" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => void handleEnable()}
                disabled={enabling}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
              >
                {enabling ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Zap size={16} />
                )}
                {enabling ? "Provisioning..." : "Add Database"}
              </button>

              <div className="relative flex items-center gap-3">
                <div className="h-px flex-1 bg-[#e5e7eb]" />
                <span className="text-xs text-[#9ca3af]">or</span>
                <div className="h-px flex-1 bg-[#e5e7eb]" />
              </div>

              <div className="relative group inline-block">
                <button
                  onClick={() => !isFree && setShowByoModal(true)}
                  disabled={isFree}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    isFree
                      ? "cursor-not-allowed border-[#e5e7eb] text-[#9ca3af]"
                      : "border-[#e5e7eb] text-[#6b7280] hover:border-[#F97316]/40 hover:text-[#1a1a1a]",
                  )}
                >
                  <Link2 size={14} />
                  Connect your own Supabase
                </button>
              </div>
            </>
          )}

          {error && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-red-500">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>

        {/* BYO Supabase modal */}
        {showByoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-2xl">
              <button
                onClick={() => setShowByoModal(false)}
                className="absolute right-4 top-4 rounded-lg p-1 text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
              >
                <X size={16} />
              </button>

              <h3 className="mb-1 text-base font-semibold text-[#1a1a1a]">
                Connect your Supabase
              </h3>
              <p className="mb-5 text-xs text-[#9ca3af]">
                Enter your project URL and anon key. We never store your service role key.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#6b7280]">
                    Project URL
                  </label>
                  <input
                    value={byoUrl}
                    onChange={(e) => setByoUrl(e.target.value)}
                    placeholder="https://xxx.supabase.co"
                    className="h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm outline-none focus:border-[#F97316]/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#6b7280]">
                    Anon Key
                  </label>
                  <input
                    value={byoAnonKey}
                    onChange={(e) => setByoAnonKey(e.target.value)}
                    placeholder="eyJ..."
                    className="h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm outline-none focus:border-[#F97316]/50"
                  />
                </div>
              </div>

              <button
                onClick={() => void handleByoConnect()}
                disabled={byoConnecting || !byoUrl.trim() || !byoAnonKey.trim()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
              >
                {byoConnecting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Link2 size={14} />
                )}
                {byoConnecting ? "Connecting..." : "Connect"}
              </button>

              {error && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
                  <AlertCircle size={12} /> {error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] shadow-lg">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ── STATE 2: Connected, not wired ───────────────────────────
  if (!dbWired) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center", className)}>
        <div className="mx-auto w-full max-w-md space-y-6 px-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
            <Database size={28} className="text-amber-600" />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-sm font-semibold text-amber-700">Database — Provisioned</span>
            </div>
            <p className="text-sm text-[#9ca3af]">
              {dbProvider === "supabase"
                ? "Your Supabase database is connected."
                : "A managed database is provisioned for this project."}
            </p>
          </div>

          <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-left">
            <p className="text-sm font-semibold text-[#1a1a1a]">Wire to app</p>
            <p className="mt-1 text-xs text-[#9ca3af]">
              Beomz will rewrite your app's data layer to use the database.
              This generates bindings and updates your components.
            </p>
            <button
              onClick={() => void handleWire()}
              disabled={wiringDb}
              className="mt-4 flex items-center gap-2 rounded-lg bg-[#1a1a1a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#333] disabled:opacity-50"
            >
              {wiringDb ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Zap size={14} />
              )}
              {wiringDb ? "Wiring..." : "Wire to app"}
            </button>
          </div>

          {error && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-red-500">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── STATE 3: Fully wired — three-mode tabbed panel ──────────

  const INNER_TAB_ITEMS: { key: PanelTab; icon: typeof Table2; label: string }[] = [
    { key: "schema", icon: Layers, label: "Schema" },
    { key: "data", icon: Table2, label: "Data" },
    { key: "bindings", icon: Link2, label: "Bindings" },
    { key: "logs", icon: ScrollText, label: "Logs" },
  ];

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>

      {/* ── Mode tab bar (BEO-400) ────────────────────────── */}
      <div className="flex items-center gap-0.5 border-b border-[#e5e7eb] bg-[#faf9f6] px-4 pt-3 pb-0">
        {(
          [
            { key: "shared" as ModeTab, label: "Shared" },
            { key: "dedicated" as ModeTab, label: "Dedicated" },
            { key: "byo" as ModeTab, label: "Connect your own" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setModeTab(key)}
            className={cn(
              "rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors",
              modeTab === key
                ? "border-[#e5e7eb] bg-white text-[#1a1a1a]"
                : "border-transparent text-[#9ca3af] hover:text-[#6b7280]",
            )}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
        </div>
      </div>

      {/* ── SHARED MODE ───────────────────────────────────── */}
      {modeTab === "shared" && (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Storage info card + add-on row */}
          <div className="space-y-3 border-b border-[#e5e7eb] px-4 py-3">

            {/* Info card: plan badge + storage bar */}
            <div className="rounded-xl border border-[#e5e7eb] bg-[#faf9f6] p-3.5">

              {/* Plan badge + Shared badge */}
              <div className="mb-3 flex items-center gap-2">
                <span className={cn("flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold", planBadge.className)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", planBadge.dotClass)} />
                  {planBadge.label}
                </span>
                <span className="rounded-md bg-[#ebebeb] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                  Shared
                </span>
              </div>

              {/* Storage label */}
              <p className="mb-2 text-[11px] font-medium text-[#6b7280]">Storage</p>

              {/* Bar — always rendered */}
              {dbUsageLoading ? (
                <div className="h-2 w-full animate-pulse rounded-full bg-[#e5e7eb]" />
              ) : (
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", barColorClass)}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              )}

              {/* Usage label below bar */}
              <div className="mt-1.5 flex items-center justify-between">
                {dbUsageLoading ? (
                  <span className="h-3 w-28 animate-pulse rounded bg-[#e5e7eb]" />
                ) : dbUsageError ? (
                  <span className="flex items-center gap-1 text-[11px] text-[#9ca3af]">
                    <AlertCircle size={11} />
                    Couldn't load usage —{" "}
                    <button
                      onClick={() => void fetchDbUsage()}
                      className="underline underline-offset-2 hover:text-[#6b7280]"
                    >
                      retry
                    </button>
                  </span>
                ) : (
                  <span className="text-[11px] text-[#9ca3af]">
                    {formatStorageMb(usedMb)} / {formatStorageMb(limitMb)}
                    {limitMb > 0 && (
                      <span className="ml-1.5 text-[#d1d5db]">·</span>
                    )}
                    {limitMb > 0 && (
                      <span className="ml-1.5">{Math.round(fillPct)}% used</span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Storage add-on row */}
            <div>
              <p className="mb-2 text-[11px] text-[#9ca3af]">
                Need more storage? Add to this project.
              </p>
              <div className="flex items-center gap-2">
                {addonsLoading || addons === null ? (
                  /* Loading state — three placeholder disabled buttons */
                  ["+500MB", "+2GB", "+10GB"].map((label) => (
                    <div
                      key={label}
                      className="group relative flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-2"
                    >
                      <span className="text-[11px] font-semibold text-[#d1d5db]">{label}</span>
                      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#1a1a1a] px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100">
                        Loading...
                      </div>
                    </div>
                  ))
                ) : addons.length === 0 ? null : (
                  addons.map((addon) => (
                    <button
                      key={addon.price_id}
                      onClick={() => void handleStorageAddon(addon.price_id!)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-2 text-[11px] font-medium text-[#374151] transition-colors hover:border-[#F97316]/50 hover:bg-[#F97316]/5 hover:text-[#F97316]"
                    >
                      <span className="font-semibold">{addon.label}</span>
                      <span className="text-[#9ca3af]">${addon.price_usd}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Storage limit reached banner */}
          {storageLimitReached && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3">
              <p className="mb-2 text-xs font-semibold text-red-700">
                Storage limit reached — {formatStorageMb(limitMb)} used of {formatStorageMb(limitMb)}
              </p>
              <div className="flex flex-wrap gap-2">
                {(addons ?? []).filter((a) => a.price_id).map((addon) => (
                  <button
                    key={addon.price_id}
                    onClick={() => void handleStorageAddon(addon.price_id!)}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#374151] shadow-sm ring-1 ring-[#e5e7eb] transition-colors hover:ring-[#F97316]/50"
                  >
                    {addon.label} ${addon.price_usd}
                  </button>
                ))}
                <button
                  onClick={() => window.open("https://beomz.ai/plan", "_blank")}
                  className="rounded-lg bg-[#F97316] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#ea6c10]"
                >
                  Upgrade plan →
                </button>
              </div>
            </div>
          )}

          {/* Inner tab bar — Schema / Data / Bindings / Logs (unchanged) */}
          <div className="flex items-center gap-1 border-b border-[#e5e7eb] bg-[#faf9f6] px-4 pt-2 pb-0">
            {INNER_TAB_ITEMS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === key
                    ? "border-[#e5e7eb] bg-white text-[#1a1a1a]"
                    : "border-transparent text-[#9ca3af] hover:text-[#6b7280]",
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          {/* Inner tab content — unchanged from original */}
          <div className="flex-1 overflow-y-auto p-4">

            {/* ── SCHEMA TAB ── */}
            {activeTab === "schema" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#1a1a1a]">Tables</p>
                  <button
                    onClick={() => void fetchSchema()}
                    disabled={schemaLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-2.5 py-1.5 text-xs text-[#6b7280] transition-colors hover:bg-white"
                  >
                    <RefreshCw size={12} className={schemaLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {schemaLoading && schemaTables.length === 0 && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-[#9ca3af]" />
                  </div>
                )}

                {schemaError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500">
                    <AlertCircle size={12} /> {schemaError}
                  </p>
                )}

                {!schemaLoading && schemaTables.length === 0 && !schemaError && (
                  <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center">
                    <p className="text-sm font-medium text-[#6b7280]">No tables yet</p>
                    <p className="mt-1 text-xs text-[#9ca3af]">
                      Ask Beomz to create tables in the chat panel.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {schemaTables.map((t) => {
                    const isExpanded = expandedTables.has(t.table_name);
                    return (
                      <div key={t.table_name} className="rounded-xl border border-[#e5e7eb] bg-white">
                        <button
                          className="flex w-full items-center justify-between px-4 py-3 text-left"
                          onClick={() =>
                            setExpandedTables((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.table_name)) next.delete(t.table_name);
                              else next.add(t.table_name);
                              return next;
                            })
                          }
                        >
                          <span className="text-sm font-medium text-[#1a1a1a]">{t.table_name}</span>
                          <span className="text-[10px] text-[#9ca3af]">
                            {t.columns.length} column{t.columns.length !== 1 ? "s" : ""}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-[#e5e7eb] px-4 py-3 space-y-1">
                            {t.columns.map((c) => (
                              <div key={`${t.table_name}-${c.name}`} className="flex items-center justify-between text-xs">
                                <span className="font-medium text-[#374151]">{c.name}</span>
                                <span className="font-mono text-[10px] text-[#9ca3af]">{c.type}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {schemaTables.length > 0 && (
                  <button className="flex items-center gap-1.5 text-xs font-medium text-[#F97316] transition-colors hover:text-[#ea6c10]">
                    <MessageSquare size={12} />
                    Ask Beomz to create or modify tables
                  </button>
                )}
              </div>
            )}

            {/* ── DATA TAB ── */}
            {activeTab === "data" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    value={dataTable}
                    onChange={(e) => setDataTable(e.target.value)}
                    className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#F97316]/50"
                  >
                    <option value="">Select a table...</option>
                    {schemaTables.map((t) => (
                      <option key={t.table_name} value={t.table_name}>
                        {t.table_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setNewRow({});
                      setShowAddRowModal(true);
                    }}
                    disabled={!dataTable}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-[#F97316] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
                  >
                    <Plus size={12} />
                    Add row
                  </button>
                  {dataTable && (
                    <button
                      onClick={() => void fetchRows(dataTable)}
                      disabled={dataLoading}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-2.5 text-xs text-[#6b7280] transition-colors hover:bg-white"
                    >
                      <RefreshCw size={12} className={dataLoading ? "animate-spin" : ""} />
                    </button>
                  )}
                </div>

                {/* No table selected — BEO-403 */}
                {!dataTable && (
                  <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center">
                    <Table2 size={24} className="mx-auto mb-3 text-[#d1d5db]" />
                    <p className="text-sm font-medium text-[#6b7280]">Select a table to view its data.</p>
                  </div>
                )}

                {dataTable && dataLoading && dataRows.length === 0 && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-[#9ca3af]" />
                  </div>
                )}

                {dataError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500">
                    <AlertCircle size={12} /> {dataError}
                  </p>
                )}
                {dataWriteError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500">
                    <AlertCircle size={12} /> {dataWriteError}
                  </p>
                )}

                {!dataLoading && dataTable && dataRows.length === 0 && !dataError && (
                  <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center">
                    <p className="text-sm font-medium text-[#6b7280]">No rows</p>
                    <p className="mt-1 text-xs text-[#9ca3af]">Add a row to get started.</p>
                  </div>
                )}

                {dataRows.length > 0 && selectedTableSchema && (
                  <div className="overflow-auto rounded-xl border border-[#e5e7eb] bg-white">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#e5e7eb] bg-[#faf9f6]">
                          {selectedTableSchema.columns.map((c) => (
                            <th
                              key={c.name}
                              className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]"
                            >
                              {c.name}
                            </th>
                          ))}
                          <th className="w-10 px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {dataRows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#faf9f6]">
                            {selectedTableSchema.columns.map((c) => {
                              const isEditing =
                                editingCell?.rowIdx === rowIdx && editingCell?.column === c.name;
                              const value = row[c.name];
                              return (
                                <td
                                  key={`${rowIdx}-${c.name}`}
                                  className="px-3 py-2 cursor-pointer"
                                  onClick={() => setEditingCell({ rowIdx, column: c.name })}
                                >
                                  {isEditing ? (
                                    <input
                                      autoFocus
                                      defaultValue={value == null ? "" : String(value)}
                                      className="h-7 w-full rounded border border-[#e5e7eb] px-2 text-xs outline-none focus:border-[#F97316]/50"
                                      onBlur={(e) => {
                                        setEditingCell(null);
                                        if (e.target.value !== (value == null ? "" : String(value))) {
                                          void handleUpdateCell(rowIdx, c.name, e.target.value);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        if (e.key === "Escape") setEditingCell(null);
                                      }}
                                    />
                                  ) : (
                                    <span className="text-[#374151]">
                                      {value == null ? <span className="text-[#d1d5db]">null</span> : String(value)}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteRow(rowIdx);
                                }}
                                className="rounded p-1 text-[#d1d5db] transition-colors hover:text-red-500"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add row modal */}
                {showAddRowModal && selectedTableSchema && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="relative w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-2xl">
                      <button
                        onClick={() => setShowAddRowModal(false)}
                        className="absolute right-4 top-4 rounded-lg p-1 text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
                      >
                        <X size={16} />
                      </button>

                      <h3 className="mb-4 text-base font-semibold text-[#1a1a1a]">
                        Add row to {dataTable}
                      </h3>

                      <div className="space-y-3">
                        {editableCols.map((c) => (
                          <div key={c.name}>
                            <label className="mb-1 block text-[11px] font-medium text-[#6b7280]">
                              {c.name} <span className="font-mono text-[#9ca3af]">({c.type})</span>
                            </label>
                            <input
                              value={newRow[c.name] ?? ""}
                              onChange={(e) => setNewRow((prev) => ({ ...prev, [c.name]: e.target.value }))}
                              className="h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm outline-none focus:border-[#F97316]/50"
                            />
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => void handleInsertRow()}
                        className="mt-5 w-full rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
                      >
                        Insert row
                      </button>

                      {dataWriteError && (
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
                          <AlertCircle size={12} /> {dataWriteError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── BINDINGS TAB ── */}
            {activeTab === "bindings" && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[#1a1a1a]">Component bindings</p>
                <p className="text-xs text-[#9ca3af]">
                  Shows which components are connected to which tables.
                </p>

                {schemaLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-[#9ca3af]" />
                  </div>
                )}

                {!schemaLoading && schemaTables.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center">
                    <p className="text-sm font-medium text-[#6b7280]">No bindings yet</p>
                    <p className="mt-1 text-xs text-[#9ca3af]">
                      Tables will appear here once created.
                    </p>
                  </div>
                )}

                {schemaTables.length > 0 && (
                  <div className="space-y-2">
                    {schemaTables.map((t) => (
                      <div
                        key={t.table_name}
                        className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <Table2 size={14} className="text-[#9ca3af]" />
                          <span className="text-sm font-medium text-[#1a1a1a]">{t.table_name}</span>
                        </div>
                        <span className="text-xs text-[#9ca3af]">
                          {t.columns.length} column{t.columns.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── LOGS TAB ── */}
            {activeTab === "logs" && (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[#1a1a1a]">Query logs</p>
                <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center">
                  <ScrollText size={28} className="mx-auto mb-3 text-[#d1d5db]" />
                  <p className="text-sm font-medium text-[#6b7280]">Query logs coming soon</p>
                  <p className="mt-1 text-xs text-[#9ca3af]">
                    We're building real-time query logging infrastructure.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DEDICATED MODE ────────────────────────────────── */}
      {modeTab === "dedicated" && (
        <div className="flex flex-1 items-center justify-center px-8 py-12">
          <div className="w-full max-w-xs text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1a1a1a]/6">
              <HardDrive size={32} className="text-[#1a1a1a]" />
            </div>

            <h2 className="text-base font-semibold text-[#1a1a1a]">
              Your own Postgres instance
            </h2>

            <div className="mt-3 space-y-1 text-sm text-[#9ca3af]">
              <p>Dedicated compute · Daily backups · Direct connection</p>
              <p>No shared limits — your data, isolated.</p>
            </div>

            <p className="mt-4 text-sm font-medium text-[#6b7280]">
              $39 <span className="text-[#9ca3af] font-normal">/ month per project</span>
            </p>

            <button
              onClick={() => showToast("Coming soon — dedicated database provisioning")}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
            >
              Add dedicated database
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── BYO MODE ─────────────────────────────────────── */}
      {modeTab === "byo" && (
        <div className="flex flex-1 items-center justify-center px-8 py-12">
          <div className="w-full max-w-xs text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F97316]/10">
              <PlugZap size={32} className="text-[#F97316]" />
            </div>

            <h2 className="text-base font-semibold text-[#1a1a1a]">
              Connect your Supabase project
            </h2>

            <div className="mt-3 space-y-1 text-sm text-[#9ca3af]">
              <p>Already have a Supabase account?</p>
              <p>Wire your existing project directly to this app.</p>
              <p>Your account · Your billing · Your data.</p>
            </div>

            <button
              onClick={() => showToast("Coming soon — BYO Supabase OAuth flow")}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-5 py-3 text-sm font-semibold text-[#374151] transition-colors hover:border-[#F97316]/40 hover:text-[#F97316]"
            >
              Connect via Supabase
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
