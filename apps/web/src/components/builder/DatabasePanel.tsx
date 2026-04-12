/**
 * DatabasePanel — V2 database management panel.
 *
 * Three panel states driven by project DB fields:
 *   1. Not connected (database_enabled = false) → enable / BYO connect
 *   2. Connected, not wired (database_enabled = true, db_wired = false) → wire CTA
 *   3. Fully wired (db_wired = true) → Schema / Data / Bindings / Logs tabs
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Crown,
} from "lucide-react";
import { cn } from "../../lib/cn";
import {
  enableDatabase,
  wireDatabase,
  connectDatabase,
  getDbSchema,
  getDbRows,
  runDbMigration,
  type DbTable,
} from "../../lib/api";
import { getOrBootWebContainer, isWebContainerSupported } from "../../lib/webcontainer";

type PanelTab = "schema" | "data" | "bindings" | "logs";

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

  // BYO Supabase modal
  const [showByoModal, setShowByoModal] = useState(false);
  const [byoUrl, setByoUrl] = useState("");
  const [byoAnonKey, setByoAnonKey] = useState("");
  const [byoConnecting, setByoConnecting] = useState(false);

  // ── Tabs state ────────────────────────────────────────────
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
    () => schemaTables.find((t) => t.name === dataTable) ?? null,
    [schemaTables, dataTable],
  );

  // ── API actions ───────────────────────────────────────────

  const handleEnable = useCallback(async () => {
    if (!projectId) return;
    setEnabling(true);
    setError(null);
    try {
      await enableDatabase(projectId);
      onDbStateChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable database.");
    } finally {
      setEnabling(false);
    }
  }, [projectId, onDbStateChange]);

  const handleWire = useCallback(async () => {
    if (!projectId) return;
    setWiringDb(true);
    setError(null);
    try {
      const result = await wireDatabase(projectId);

      console.log("[DatabasePanel] wire response — files:", result.files?.length ?? 0, "wired:", result.wired);

      // Write patched files into WebContainer so the preview reflects the wired code
      if (result.files && result.files.length > 0 && isWebContainerSupported()) {
        try {
          const { wc } = await getOrBootWebContainer();
          let written = 0;
          for (const file of result.files) {
            try {
              await wc.fs.writeFile(file.path, file.content);
              written++;
            } catch (fileErr) {
              console.warn("[DatabasePanel] Failed to write wired file:", file.path, fileErr);
            }
          }
          console.log("[DatabasePanel] Wrote", written, "/", result.files.length, "wired files to WebContainer");
        } catch (wcErr) {
          console.warn("[DatabasePanel] WebContainer not available for file write:", wcErr);
        }
      }

      // Inject Supabase credentials into WebContainer so the app can connect
      if (result.dbCredentials && isWebContainerSupported()) {
        try {
          const { supabaseUrl, supabaseAnonKey, schemaName } = result.dbCredentials;
          const envContent = [
            `VITE_SUPABASE_URL=${supabaseUrl}`,
            `VITE_SUPABASE_ANON_KEY=${supabaseAnonKey}`,
            `VITE_DB_SCHEMA=${schemaName}`,
            "",
          ].join("\n");
          const { wc } = await getOrBootWebContainer();
          await wc.fs.writeFile(".env.local", envContent);
          console.log("[DatabasePanel] Injected DB env into WebContainer (.env.local)");
          // Touch vite.config to force Vite to restart and pick up new env
          try {
            const cfg = await wc.fs.readFile("vite.config.ts", "utf-8");
            await wc.fs.writeFile("vite.config.ts", cfg);
          } catch {
            // vite.config may not exist yet — env will load on next Vite start
          }
        } catch (wcErr) {
          console.warn("[DatabasePanel] Failed to inject DB env into WebContainer:", wcErr);
        }
      }

      onDbStateChange();
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
      if (!dataTable && data.tables?.length > 0) {
        setDataTable(data.tables[0].name);
      }
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : "Failed to load schema.");
    } finally {
      setSchemaLoading(false);
    }
  }, [projectId, dataTable]);

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
      await runDbMigration(projectId, sql);
      setShowAddRowModal(false);
      setNewRow({});
      await fetchRows(dataTable);
    } catch (err) {
      setDataWriteError(err instanceof Error ? err.message : "Failed to add row.");
    }
  }, [projectId, dataTable, selectedTableSchema, newRow, fetchRows]);

  const handleUpdateCell = useCallback(async (rowIdx: number, column: string, value: string) => {
    if (!projectId || !dataTable) return;
    setDataWriteError(null);
    const row = dataRows[rowIdx];
    if (!row) return;
    const pk = row.id ?? row[Object.keys(row)[0]];
    const pkCol = "id" in row ? "id" : Object.keys(row)[0];
    const sql = `UPDATE "${dataTable}" SET "${column}" = '${value.replace(/'/g, "''")}' WHERE "${pkCol}" = '${String(pk).replace(/'/g, "''")}';`;
    try {
      await runDbMigration(projectId, sql);
      await fetchRows(dataTable);
    } catch (err) {
      setDataWriteError(err instanceof Error ? err.message : "Failed to update cell.");
    }
  }, [projectId, dataTable, dataRows, fetchRows]);

  const handleDeleteRow = useCallback(async (rowIdx: number) => {
    if (!projectId || !dataTable) return;
    const row = dataRows[rowIdx];
    if (!row) return;
    const pk = row.id ?? row[Object.keys(row)[0]];
    const pkCol = "id" in row ? "id" : Object.keys(row)[0];
    const sql = `DELETE FROM "${dataTable}" WHERE "${pkCol}" = '${String(pk).replace(/'/g, "''")}';`;
    setDataWriteError(null);
    try {
      await runDbMigration(projectId, sql);
      await fetchRows(dataTable);
    } catch (err) {
      setDataWriteError(err instanceof Error ? err.message : "Failed to delete row.");
    }
  }, [projectId, dataTable, dataRows, fetchRows]);

  // Auto-fetch schema when entering wired state
  useEffect(() => {
    if (dbWired && (activeTab === "schema" || activeTab === "data" || activeTab === "bindings")) {
      void fetchSchema();
    }
  }, [dbWired, activeTab, fetchSchema]);

  // Auto-fetch rows when table changes
  useEffect(() => {
    if (dbWired && activeTab === "data" && dataTable) {
      void fetchRows(dataTable);
    }
  }, [dbWired, activeTab, dataTable, fetchRows]);

  const editableCols = useMemo(
    () => (selectedTableSchema?.columns ?? []).filter(
      (c) => c.name !== "id" && c.name !== "created_at" && c.name !== "updated_at",
    ),
    [selectedTableSchema],
  );

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
              {isFree && <Crown size={12} className="text-[#F97316]" />}
            </button>
            {isFree && (
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                Upgrade to connect your own database
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]" />
              </div>
            )}
          </div>

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

  // ── STATE 3: Fully wired — tabbed panel ─────────────────────

  const TAB_ITEMS: { key: PanelTab; icon: typeof Table2; label: string }[] = [
    { key: "schema", icon: Layers, label: "Schema" },
    { key: "data", icon: Table2, label: "Data" },
    { key: "bindings", icon: Link2, label: "Bindings" },
    { key: "logs", icon: ScrollText, label: "Logs" },
  ];

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[#e5e7eb] bg-[#faf9f6] px-4 pt-3 pb-0">
        {TAB_ITEMS.map(({ key, icon: Icon, label }) => (
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

        <div className="ml-auto flex items-center gap-2 pb-1">
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
        </div>
      </div>

      {/* Tab content */}
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
                const isExpanded = expandedTables.has(t.name);
                return (
                  <div key={t.name} className="rounded-xl border border-[#e5e7eb] bg-white">
                    <button
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                      onClick={() =>
                        setExpandedTables((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.name)) next.delete(t.name);
                          else next.add(t.name);
                          return next;
                        })
                      }
                    >
                      <span className="text-sm font-medium text-[#1a1a1a]">{t.name}</span>
                      <span className="text-[10px] text-[#9ca3af]">
                        {t.columns.length} column{t.columns.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-[#e5e7eb] px-4 py-3 space-y-1">
                        {t.columns.map((c) => (
                          <div key={`${t.name}-${c.name}`} className="flex items-center justify-between text-xs">
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
                <option value="">Select table</option>
                {schemaTables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
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

            {dataLoading && dataRows.length === 0 && (
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
                    key={t.name}
                    className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Table2 size={14} className="text-[#9ca3af]" />
                      <span className="text-sm font-medium text-[#1a1a1a]">{t.name}</span>
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
  );
}
