/**
 * DatabasePanel — V2 database management panel.
 *
 * Top-level tab structure:
 *   "Managed"           — Beomz-provisioned Neon DB (Add Database → wire → schema/data)
 *   "Connect your own"  — BYO Postgres URL (BEO-445)
 *
 * Within "Managed", three substates driven by project DB fields:
 *   1. Not connected (database_enabled = false) → Add Database
 *   2. Connected, not wired (database_enabled = true, db_wired = false) → wire CTA
 *   3. Fully wired (db_wired = true) → schema/data/users/storage panel
 *
 * BEO-400: Three-mode layout with upsell surface, storage usage bar, plan badge.
 * BEO-403: Storage bar always visible; Data tab 404 fix; Shared tab cleanup.
 * BEO-289: Schema tab renders table.table_name; Data tab select populated from table_name.
 * BEO-445: "Connect your own" tab — BYO Postgres URL input + test + save.
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
  ArrowUpRight,
  Users,
  CheckCircle,
  XCircle,
  PlugZap,
  WifiOff,
} from "lucide-react";
import { cn } from "../../lib/cn";
import {
  enableDatabase,
  wireDatabase,
  getDbSchema,
  getDbRows,
  runDbMigration,
  getDbUsage,
  getStorageAddons,
  createStorageAddonCheckout,
  saveByoDb,
  disconnectByoDb,
  type DbTable,
  type StorageAddonInfo,
} from "../../lib/api";
import { neon } from "@neondatabase/serverless";

type OuterTab = "managed" | "byo";
type PanelTab = "schema" | "data" | "bindings" | "logs" | "users";
type ModeTab = "shared" | "dedicated";
type ByoStatus = "idle" | "testing" | "test_ok" | "test_fail" | "saving" | "saved";

const WIRING_PROMPT = `Wire this app to its Postgres database.

CRITICAL — use this EXACT import, verbatim, in every file that needs database access:
  import { neon } from '@neondatabase/serverless'
  const sql = neon(import.meta.env.VITE_DATABASE_URL)

DO NOT use or import:
- pg, Pool, node-postgres
- @neondatabase/neon-js or any neon-js subpath
- NeonAuthUIProvider, AuthView, createAuthClient
- process.env.DATABASE_URL (use import.meta.env.VITE_DATABASE_URL)
- Do NOT create auth UI, login pages, or authentication
- Do NOT create local helper files (./db.ts, ./neon.ts, ./client.ts)

Instructions:
1. At app startup, run CREATE TABLE IF NOT EXISTS for each table the app needs, inside a useEffect that runs once.
   Wrap the entire init() body in try/catch and swallow errors silently — the table likely already exists. Example:
   useEffect(() => {
     async function init() {
       try {
         await sql\`CREATE TABLE IF NOT EXISTS tasks (
           id SERIAL PRIMARY KEY,
           title TEXT NOT NULL,
           done BOOLEAN DEFAULT false,
           created_at TIMESTAMPTZ DEFAULT NOW()
         )\`
       } catch (e) {
         // table already exists, ignore
       }
     }
     init()
   }, [])

2. Replace all mock/static data with real database queries
3. Wire all existing UI components to read and write real data
4. Keep all existing UI, layout, and styling intact
5. Use tagged template literals for ALL queries:
   const rows = await sql\`SELECT * FROM tasks ORDER BY created_at DESC\`
   await sql\`INSERT INTO tasks (title) VALUES (\${title})\`
   await sql\`DELETE FROM tasks WHERE id = \${id}\`

Authentication (optional — only include if the app needs user accounts):
The Beomz API handles auth for your app. Use simple fetch() calls only —
no npm packages, no imports.

  const PROJECT_ID = import.meta.env.VITE_PROJECT_ID;
  const API = \`/api/projects/\${PROJECT_ID}\`;

  // Signup: POST \${API}/auth/signup  body: { email, password, name? }
  // Login:  POST \${API}/auth/login   body: { email, password }
  // Me:     GET  \${API}/auth/me      header: Authorization: Bearer <token>

  Store token: localStorage.setItem('beomz_token', data.token)
  Read token:  localStorage.getItem('beomz_token')
  No npm auth packages. No imports. Just fetch and localStorage.

After completing the wiring, respond with ONLY 1-2 sentences confirming what you did.
Do not show file contents, import statements, or code examples in your response.
Example: 'Done — I've wired your app to the Neon database. Notes are now saved and loaded from Postgres automatically.'`;

function formatStorageMb(mb: number): string {
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
}

function getPlanStorageLimitMb(_plan: string): number {
  return 500;
}

/** Extract hostname from a postgres:// connection string, hiding credentials. */
function parseHost(connectionString: string): string {
  try {
    const url = new URL(connectionString.replace(/^postgres:\/\//, "postgresql://"));
    return url.hostname;
  } catch {
    const m = connectionString.match(/@([^/:]+)/);
    return m?.[1] ?? "your database";
  }
}

/**
 * Always encode the username and password portion of a postgres connection string.
 * Decodes first to avoid double-encoding if the string is already partially encoded.
 * Uses last-@ splitting so passwords that contain @ are handled correctly.
 */
function tryDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Build the final connection string to send to the API:
 * - If rawPassword is provided, inject it (encoded) into the URL
 * - Otherwise encode the credentials already in the URL
 */
function getFinalConnectionString(url: string, rawPassword: string): string {
  const schemeMatch = url.match(/^(postgres(?:ql)?:\/\/)/);
  if (!schemeMatch) return url;
  const scheme = schemeMatch[1];
  const withoutScheme = url.slice(scheme.length);
  const lastAt = withoutScheme.lastIndexOf("@");
  const credentials = lastAt !== -1 ? withoutScheme.slice(0, lastAt) : withoutScheme;
  const hostPart = lastAt !== -1 ? withoutScheme.slice(lastAt + 1) : "";
  const colonIdx = credentials.indexOf(":");
  const user = colonIdx !== -1 ? credentials.slice(0, colonIdx) : credentials;
  const password = rawPassword.trim() || (colonIdx !== -1 ? credentials.slice(colonIdx + 1) : "");
  return `${scheme}${encodeURIComponent(tryDecode(user))}:${encodeURIComponent(tryDecode(password))}@${hostPart}`;
}

// ── BYO provider data (BEO-518) ──────────────────────────────────────────────

const BYO_PROVIDERS = [
  {
    key: "neon",
    name: "Neon",
    bg: "#edfdf4",
    dot: "#00e699",
    initial: "N",
    placeholder: "postgres://user:pass@ep-xxx.neon.tech/neondb",
    docsUrl: "https://neon.tech/docs/connect/connect-from-any-app",
    docsLabel: "Settings → Connection string",
  },
  {
    key: "supabase",
    name: "Supabase",
    bg: "#edfaf4",
    dot: "#3ecf8e",
    initial: "S",
    placeholder: "postgres://postgres:pass@db.xxx.supabase.co:5432/postgres",
    docsUrl: "https://supabase.com/dashboard",
    docsLabel: "Project → Settings → Database",
  },
  {
    key: "railway",
    name: "Railway",
    bg: "#f3f0ff",
    dot: "#7c3aed",
    initial: "R",
    placeholder: "postgres://postgres:pass@monorail.proxy.rlwy.net:5432/railway",
    docsUrl: "https://railway.app",
    docsLabel: "Project → Variables",
  },
  {
    key: "render",
    name: "Render",
    bg: "#edfafe",
    dot: "#46e3b7",
    initial: "R",
    placeholder: "postgres://user:pass@dpg-xxx.render.com/dbname",
    docsUrl: "https://render.com",
    docsLabel: "Database → Connection",
  },
  {
    key: "flyio",
    name: "Fly.io",
    bg: "#f5f0ff",
    dot: "#8b5cf6",
    initial: "F",
    placeholder: "postgres://postgres:pass@xxx.flycast:5432/dbname",
    docsUrl: "https://fly.io/docs/postgres",
    docsLabel: "App → Postgres",
  },
  {
    key: "self",
    name: "Self-hosted",
    bg: "#f3f4f6",
    dot: "#9ca3af",
    initial: "⚙",
    placeholder: "postgres://user:pass@your-host:5432/dbname",
    docsUrl: null,
    docsLabel: null,
  },
] as const;

interface DatabasePanelProps {
  className?: string;
  projectId: string | null;
  databaseEnabled: boolean;
  dbProvider: string | null;
  dbWired: boolean;
  plan: string;
  /** BEO-445: sanitised host returned by API when provider === 'byo' */
  byoConnectedHost?: string | null;
  onDbStateChange: () => void;
  onWireToDatabase?: (prompt: string) => void;
}

export function DatabasePanel({
  className,
  projectId,
  databaseEnabled,
  dbProvider,
  dbWired,
  plan,
  byoConnectedHost,
  onDbStateChange,
  onWireToDatabase,
}: DatabasePanelProps) {
  // ── Outer tabs ───────────────────────────────────────
  const isByoConnected = dbProvider === "byo";
  const [outerTab, setOuterTab] = useState<OuterTab>(isByoConnected ? "byo" : "managed");

  // Keep outer tab in sync when dbProvider changes (e.g. after page load)
  useEffect(() => {
    if (isByoConnected) setOuterTab("byo");
  }, [isByoConnected]);

  // ── BYO Postgres state (BEO-445) — wizard ─────────────
  const [byoStep, setByoStep] = useState<1 | 2 | 3>(1);
  const [byoConnectionString, setByoConnectionString] = useState("");
  const [byoRawPassword, setByoRawPassword] = useState("");
  const [byoStatus, setByoStatus] = useState<ByoStatus>("idle");
  const [byoTestError, setByoTestError] = useState<string | null>(null);
  const [byoSaveError, setByoSaveError] = useState<string | null>(null);
  const [byoStep2Error, setByoStep2Error] = useState<string | null>(null);
  const [byoSavedHost, setByoSavedHost] = useState<string | null>(byoConnectedHost ?? null);
  const [byoDisconnecting, setByoDisconnecting] = useState(false);
  const [byoSelectedProvider, setByoSelectedProvider] = useState<string | null>(null);

  // ── Managed DB — Connection / wiring state ────────────
  const [enabling, setEnabling] = useState(false);
  const [wiringStatus, setWiringStatus] = useState<"idle" | "connected">("idle");
  const [wiringDb, setWiringDb] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Managed DB — Mode tabs ────────────────────────────
  const [modeTab, setModeTab] = useState<ModeTab>("shared");

  // ── Storage usage ─────────────────────────────────────
  const [dbUsage, setDbUsage] = useState<{ used_mb: number; limits: { storage_mb: number } } | null>(null);
  const [dbUsageLoading, setDbUsageLoading] = useState(false);
  const [dbUsageError, setDbUsageError] = useState(false);

  const [addons, setAddons] = useState<StorageAddonInfo[] | null>(null);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [storageLimitReached, setStorageLimitReached] = useState(false);

  // ── Toast ─────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Inner panel tabs (managed wired state) ────────────
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

  // Users tab
  const [usersRows, setUsersRows] = useState<Record<string, unknown>[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const selectedTableSchema = useMemo(
    () => schemaTables.find((t) => t.table_name === dataTable) ?? null,
    [schemaTables, dataTable],
  );

  // ── Managed DB API actions ────────────────────────────

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
      setEnabling(false);
      setWiringStatus("connected");
      onDbStateChange();
      setTimeout(() => {
        onWireToDatabase?.(WIRING_PROMPT);
      }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable database.");
      setEnabling(false);
    }
  }, [projectId, onDbStateChange, onWireToDatabase]);

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

  const fetchUsers = useCallback(async () => {
    if (!projectId) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await getDbRows(projectId, "users");
      setUsersRows(data.rows ?? []);
    } catch {
      setUsersError("Couldn't load users — retry");
    } finally {
      setUsersLoading(false);
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

  // ── BYO DB actions (BEO-445 / BEO-520) ───────────────

  /** Browser-side connection test — avoids server IP restrictions. */
  const runBrowserTest = useCallback(async (connectionString: string) => {
    const sql = neon(connectionString);
    await sql`SELECT 1`;
  }, []);

  const handleTestByo = useCallback(async () => {
    if (!byoConnectionString.trim()) return;
    setByoStatus("testing");
    setByoTestError(null);
    setByoSaveError(null);
    try {
      const final = getFinalConnectionString(byoConnectionString.trim(), byoRawPassword);
      await runBrowserTest(final);
      setByoStatus("test_ok");
    } catch (err) {
      setByoStatus("test_fail");
      setByoTestError(err instanceof Error ? err.message : "Connection failed.");
    }
  }, [byoConnectionString, byoRawPassword, runBrowserTest]);

  const handleSaveByo = useCallback(async () => {
    if (!projectId || !byoConnectionString.trim()) return;
    setByoStatus("saving");
    setByoSaveError(null);
    try {
      const final = getFinalConnectionString(byoConnectionString.trim(), byoRawPassword);
      await saveByoDb(projectId, final);
      setByoSavedHost(parseHost(final));
      setByoStatus("saved");
      setByoConnectionString("");
      setByoRawPassword("");
      onDbStateChange();
    } catch (err) {
      setByoStatus("test_ok");
      setByoSaveError(err instanceof Error ? err.message : "Failed to save connection.");
    }
  }, [projectId, byoConnectionString, byoRawPassword, onDbStateChange]);

  const handleDisconnectByo = useCallback(async () => {
    if (!projectId) return;
    setByoDisconnecting(true);
    try {
      await disconnectByoDb(projectId);
      setByoSavedHost(null);
      setByoStatus("idle");
      setByoStep(1);
      setByoConnectionString("");
      setByoRawPassword("");
      setByoSelectedProvider(null);
      onDbStateChange();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setByoDisconnecting(false);
    }
  }, [projectId, onDbStateChange, showToast]);

  /** Validate step 2 then transition to step 3 and auto-test (browser-side). */
  const handleGoTestStep = useCallback(async () => {
    const str = byoConnectionString.trim();
    if (!str) {
      setByoStep2Error("Please enter a connection string.");
      return;
    }
    if (!/^postgres(?:ql)?:\/\//i.test(str)) {
      setByoStep2Error("Must start with postgres:// or postgresql://");
      return;
    }
    setByoStep2Error(null);
    setByoStep(3);
    setByoStatus("testing");
    setByoTestError(null);
    setByoSaveError(null);
    try {
      const final = getFinalConnectionString(str, byoRawPassword);
      await runBrowserTest(final);
      setByoStatus("test_ok");
    } catch (err) {
      setByoStatus("test_fail");
      setByoTestError(err instanceof Error ? err.message : "Connection failed.");
    }
  }, [byoConnectionString, byoRawPassword, runBrowserTest]);

  // ── Side effects ──────────────────────────────────────

  useEffect(() => {
    if (dbWired && outerTab === "managed" && modeTab === "shared" &&
      (activeTab === "schema" || activeTab === "data" || activeTab === "bindings")) {
      void fetchSchema();
    }
  }, [dbWired, outerTab, modeTab, activeTab, fetchSchema]);

  useEffect(() => {
    if (dbWired && outerTab === "managed" && modeTab === "shared" && activeTab === "data" && dataTable) {
      void fetchRows(dataTable);
    }
  }, [dbWired, outerTab, modeTab, activeTab, dataTable, fetchRows]);

  useEffect(() => {
    if (dbWired && outerTab === "managed" && modeTab === "shared" && activeTab === "users") {
      void fetchUsers();
    }
  }, [dbWired, outerTab, modeTab, activeTab, fetchUsers]);

  useEffect(() => {
    if (dbWired && outerTab === "managed" && modeTab === "shared") {
      void fetchDbUsage();
      void fetchAddons();
    }
  }, [dbWired, outerTab, modeTab, fetchDbUsage, fetchAddons]);

  // Sync byoSavedHost from prop (set after page load when dbProvider === 'byo')
  useEffect(() => {
    if (byoConnectedHost) setByoSavedHost(byoConnectedHost);
  }, [byoConnectedHost]);

  const editableCols = useMemo(
    () => (selectedTableSchema?.columns ?? []).filter(
      (c) => c.name !== "id" && c.name !== "created_at" && c.name !== "updated_at",
    ),
    [selectedTableSchema],
  );

  const planLimitMb = getPlanStorageLimitMb(plan);
  const usedMb = dbUsage?.used_mb ?? 0;
  const limitMb = dbUsage?.limits.storage_mb ?? planLimitMb;
  const fillPct = limitMb > 0 ? Math.min((usedMb / limitMb) * 100, 100) : 0;
  const barColorClass = fillPct > 90 ? "bg-red-500" : fillPct > 80 ? "bg-amber-500" : "bg-[#F97316]";

  const isByoConnectedState = isByoConnected || byoStatus === "saved";

  // ── RENDER ────────────────────────────────────────────

  const INNER_TAB_ITEMS: { key: PanelTab; icon: typeof Table2; label: string }[] = [
    { key: "schema", icon: Layers, label: "Schema" },
    { key: "data", icon: Table2, label: "Data" },
    { key: "bindings", icon: Link2, label: "Bindings" },
    { key: "logs", icon: ScrollText, label: "Logs" },
    { key: "users", icon: Users, label: "Users" },
  ];

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>

      {/* ── Outer tab bar: Managed | Connect your own ───── */}
      <div className="flex items-center gap-0.5 border-b border-[#e5e7eb] bg-[#faf9f6] px-4 pt-3 pb-0 flex-shrink-0">
        {(
          [
            { key: "managed" as OuterTab, label: "Managed" },
            { key: "byo" as OuterTab, label: "Connect your own" },
          ] as { key: OuterTab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setOuterTab(key)}
            className={cn(
              "rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors",
              outerTab === key
                ? "border-[#e5e7eb] bg-white text-[#1a1a1a]"
                : "border-transparent text-[#9ca3af] hover:text-[#6b7280]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════
          MANAGED TAB
      ══════════════════════════════════════════════════ */}
      {outerTab === "managed" && (
        <>
          {/* STATE 1: Not connected */}
          {!databaseEnabled && (
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto">
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

                {wiringStatus === "connected" ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
                      <Loader2 size={16} className="animate-spin" />
                      Connected! Wiring to your app…
                    </div>
                    <p className="text-[11px] text-[#9ca3af]">
                      The build will start in a moment.
                    </p>
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
                      {enabling ? "Setting up..." : "Add Database"}
                    </button>

                    <p className="text-[11px] text-[#9ca3af]">
                      Isolated · Auto-scaling · Backed up daily
                    </p>
                  </>
                )}

                {error && wiringStatus === "idle" && (
                  <p className="flex items-center justify-center gap-1.5 text-xs text-red-500">
                    <AlertCircle size={12} /> {error}{" "}
                    <button
                      onClick={() => void handleEnable()}
                      className="underline underline-offset-2 hover:text-red-700"
                    >
                      Retry
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STATE 2: Connected, not wired */}
          {databaseEnabled && !dbWired && (
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto">
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
          )}

          {/* STATE 3: Fully wired */}
          {databaseEnabled && dbWired && (
            <div className="flex flex-1 flex-col overflow-hidden">

              {/* Mode tab bar */}
              <div className="flex items-center gap-0.5 border-b border-[#e5e7eb] bg-[#faf9f6] px-4 pt-3 pb-0 flex-shrink-0">
                {(
                  [
                    { key: "shared" as ModeTab, label: "Database", locked: false },
                    { key: "dedicated" as ModeTab, label: "Dedicated", locked: true },
                  ] as { key: ModeTab; label: string; locked: boolean }[]
                ).map(({ key, label, locked }) => (
                  <button
                    key={key}
                    onClick={() => !locked && setModeTab(key)}
                    disabled={locked}
                    className={cn(
                      "rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors",
                      locked
                        ? "cursor-not-allowed border-transparent text-[#d1d5db]"
                        : modeTab === key
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

              {/* SHARED mode */}
              {modeTab === "shared" && (
                <div className="flex flex-1 flex-col overflow-hidden">

                  {/* Storage info card + add-on row */}
                  <div className="space-y-3 border-b border-[#e5e7eb] px-4 py-3 flex-shrink-0">
                    <div className="rounded-xl border border-[#e5e7eb] bg-[#faf9f6] p-3.5">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Managed Postgres
                        </span>
                        <span className="rounded-md bg-[#ebebeb] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                          Neon
                        </span>
                      </div>

                      <p className="mb-2 text-[11px] font-medium text-[#6b7280]">Storage</p>

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
                          ["+500MB", "+2GB", "+10GB"].map((label) => (
                            <div
                              key={label}
                              className="group relative flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-2"
                            >
                              <span className="text-[11px] font-semibold text-[#d1d5db]">{label}</span>
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
                    <div className="border-b border-red-200 bg-red-50 px-4 py-3 flex-shrink-0">
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

                  {/* Inner tab bar */}
                  <div className="flex items-center gap-1 border-b border-[#e5e7eb] bg-[#faf9f6] px-4 pt-2 pb-0 flex-shrink-0">
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
                        {key === "users" ? `Users (${usersRows.length})` : label}
                      </button>
                    ))}
                  </div>

                  {/* Inner tab content */}
                  <div className="flex-1 overflow-y-auto p-4">

                    {/* SCHEMA TAB */}
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

                    {/* DATA TAB */}
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
                            onClick={() => { setNewRow({}); setShowAddRowModal(true); }}
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

                    {/* BINDINGS TAB */}
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
                            <p className="mt-1 text-xs text-[#9ca3af]">Tables will appear here once created.</p>
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

                    {/* LOGS TAB */}
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

                    {/* USERS TAB */}
                    {activeTab === "users" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#1a1a1a]">Users</p>
                          <button
                            onClick={() => void fetchUsers()}
                            disabled={usersLoading}
                            className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-2.5 py-1.5 text-xs text-[#6b7280] transition-colors hover:bg-white"
                          >
                            <RefreshCw size={12} className={usersLoading ? "animate-spin" : ""} />
                            Refresh
                          </button>
                        </div>
                        {usersLoading && usersRows.length === 0 && (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 size={20} className="animate-spin text-[#9ca3af]" />
                          </div>
                        )}
                        {usersError && (
                          <p className="flex items-center gap-1.5 text-xs text-red-500">
                            <AlertCircle size={12} /> {usersError}{" "}
                            <button
                              onClick={() => void fetchUsers()}
                              className="underline underline-offset-2 hover:text-red-700"
                            >
                              retry
                            </button>
                          </p>
                        )}
                        {!usersLoading && !usersError && usersRows.length === 0 && (
                          <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white p-8 text-center">
                            <Users size={28} className="mx-auto mb-3 text-[#d1d5db]" />
                            <p className="text-sm font-medium text-[#6b7280]">No users yet</p>
                            <p className="mt-1 text-xs text-[#9ca3af]">
                              Add auth to your app to see users here.
                            </p>
                          </div>
                        )}
                        {usersRows.length > 0 && (
                          <div className="overflow-auto rounded-xl border border-[#e5e7eb] bg-white">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="border-b border-[#e5e7eb] bg-[#faf9f6]">
                                  {["id", "email", "name", "created_at"].map((col) => (
                                    <th
                                      key={col}
                                      className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]"
                                    >
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {[...usersRows]
                                  .sort((a, b) => {
                                    const ta = a.created_at ? new Date(String(a.created_at)).getTime() : 0;
                                    const tb = b.created_at ? new Date(String(b.created_at)).getTime() : 0;
                                    return tb - ta;
                                  })
                                  .map((row, idx) => (
                                    <tr key={idx} className="border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#faf9f6]">
                                      {["id", "email", "name", "created_at"].map((col) => {
                                        const val = row[col];
                                        let display: string;
                                        if (val == null) {
                                          display = "";
                                        } else if (col === "created_at") {
                                          display = new Date(String(val)).toLocaleString();
                                        } else {
                                          display = String(val);
                                        }
                                        return (
                                          <td key={col} className="px-3 py-2 text-[#374151]">
                                            {display || <span className="text-[#d1d5db]">—</span>}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* DEDICATED mode */}
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
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          CONNECT YOUR OWN TAB — 3-step wizard (BEO-445/518)
      ══════════════════════════════════════════════════ */}
      {outerTab === "byo" && (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* ── CONNECTED STATE ── */}
          {isByoConnectedState ? (
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-16">
              <div className="w-full max-w-sm space-y-6">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                  <PlugZap size={20} className="flex-shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-emerald-700">Connected</p>
                    {(byoSavedHost || byoConnectedHost) && (
                      <p className="mt-0.5 truncate font-mono text-xs text-emerald-600">
                        {byoSavedHost ?? byoConnectedHost}
                      </p>
                    )}
                  </div>
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500" />
                </div>
                <p className="text-sm text-[#9ca3af]">
                  Your app is using this Postgres database.{" "}
                  <code className="rounded bg-[#f3f4f6] px-1 py-0.5 text-xs text-[#374151]">VITE_DATABASE_URL</code>{" "}
                  is injected automatically on every page load.
                </p>
                <button
                  onClick={() => void handleDisconnectByo()}
                  disabled={byoDisconnecting}
                  className="flex items-center gap-2 text-sm text-[#9ca3af] transition-colors hover:text-red-500 disabled:opacity-50"
                >
                  {byoDisconnecting ? <Loader2 size={14} className="animate-spin" /> : <WifiOff size={14} />}
                  {byoDisconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">

              {/* ── Step indicator ── */}
              <div className="flex items-center gap-3 border-b border-[#e5e7eb] bg-[#faf9f6] px-6 py-3 flex-shrink-0">
                {([1, 2, 3] as const).map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <div className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                      byoStep === n
                        ? "bg-[#F97316] text-white"
                        : byoStep > n
                          ? "bg-emerald-500 text-white"
                          : "bg-[#e5e7eb] text-[#9ca3af]",
                    )}>
                      {byoStep > n ? "✓" : n}
                    </div>
                    <span className={cn(
                      "text-xs font-medium",
                      byoStep === n ? "text-[#1a1a1a]" : "text-[#9ca3af]",
                    )}>
                      {n === 1 ? "Provider" : n === 2 ? "Connection" : "Connect"}
                    </span>
                    {n < 3 && <span className="text-[#d1d5db]">›</span>}
                  </div>
                ))}
              </div>

              {/* ══ STEP 1: Select provider ══ */}
              {byoStep === 1 && (
                <div className="flex-1 overflow-y-auto px-6 py-7 space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-[#1a1a1a]">Where is your database hosted?</h2>
                    <p className="mt-1 text-sm text-[#9ca3af]">Select your provider — we'll show you exactly where to find your connection string.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    {BYO_PROVIDERS.map((p) => {
                      const isSelected = byoSelectedProvider === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            setByoSelectedProvider(p.key);
                            setByoStep(2);
                          }}
                          className={cn(
                            "flex flex-col items-center gap-2.5 rounded-xl border px-3 py-4 text-center transition-all",
                            isSelected
                              ? "border-[#F97316]/40 bg-[#F97316]/5 ring-1 ring-[#F97316]/20"
                              : "border-[#e5e7eb] bg-white hover:border-[#F97316]/30 hover:bg-[#faf9f6]",
                          )}
                        >
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold"
                            style={{ backgroundColor: p.bg, color: p.dot }}
                          >
                            {p.initial}
                          </div>
                          <span className="text-xs font-medium text-[#374151]">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => { setByoSelectedProvider(null); setByoStep(2); }}
                    className="text-xs text-[#9ca3af] underline underline-offset-2 transition-colors hover:text-[#6b7280]"
                  >
                    I'll enter the URL directly →
                  </button>
                </div>
              )}

              {/* ══ STEP 2: Enter connection string ══ */}
              {byoStep === 2 && (() => {
                const provider = BYO_PROVIDERS.find((p) => p.key === byoSelectedProvider) ?? null;
                return (
                  <div className="flex-1 overflow-y-auto px-6 py-7 space-y-5">
                    {/* Back */}
                    <button
                      type="button"
                      onClick={() => { setByoStep(1); setByoStep2Error(null); }}
                      className="flex items-center gap-1.5 text-xs text-[#9ca3af] transition-colors hover:text-[#6b7280]"
                    >
                      ← Back
                    </button>

                    {/* Provider header */}
                    {provider ? (
                      <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white p-4">
                        <div
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-base font-bold"
                          style={{ backgroundColor: provider.bg, color: provider.dot }}
                        >
                          {provider.initial}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1a1a1a]">{provider.name}</p>
                          {provider.docsUrl && (
                            <a
                              href={provider.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#F97316] transition-colors hover:text-[#ea6c10]"
                            >
                              {provider.docsLabel ?? "Find your connection string"} →
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-base font-semibold text-[#1a1a1a]">Enter your connection string</h2>
                        <p className="mt-0.5 text-sm text-[#9ca3af]">Works with any Postgres host.</p>
                      </div>
                    )}

                    {/* Connection string field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#6b7280]">Connection string</label>
                      <textarea
                        value={byoConnectionString}
                        onChange={(e) => {
                          setByoConnectionString(e.target.value);
                          setByoStep2Error(null);
                        }}
                        placeholder={provider?.placeholder ?? "postgres://user:password@host:5432/dbname"}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 font-mono text-sm text-[#1a1a1a] outline-none placeholder:font-sans placeholder:text-[#c4c9d4] focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
                      />
                      <p className="text-xs text-[#9ca3af]">Stored securely — never exposed to your app's users.</p>
                    </div>

                    {/* Password field — always visible, plain text */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[#6b7280]">
                        Password{" "}
                        <span className="font-normal text-[#9ca3af]">(optional — enter in plain text if it contains special characters like @ # !)</span>
                      </label>
                      <input
                        type="text"
                        value={byoRawPassword}
                        onChange={(e) => setByoRawPassword(e.target.value)}
                        placeholder="Leave blank if the connection string already has the correct password"
                        className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#1a1a1a] outline-none placeholder:text-[#c4c9d4] focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
                      />
                      <p className="text-xs text-[#9ca3af]">
                        If filled, this replaces the password in the URL above — special characters are automatically encoded.
                      </p>
                    </div>

                    {/* Validation error */}
                    {byoStep2Error && (
                      <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                        <XCircle size={14} className="flex-shrink-0" />
                        {byoStep2Error}
                      </div>
                    )}

                    {/* Continue button */}
                    <button
                      type="button"
                      onClick={() => void handleGoTestStep()}
                      disabled={!byoConnectionString.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Test & Connect →
                    </button>
                  </div>
                );
              })()}

              {/* ══ STEP 3: Test & connect ══ */}
              {byoStep === 3 && (
                <div className="flex-1 overflow-y-auto px-6 py-7 space-y-5">
                  {/* Back */}
                  <button
                    type="button"
                    onClick={() => { setByoStep(2); setByoStatus("idle"); setByoTestError(null); setByoSaveError(null); }}
                    className="flex items-center gap-1.5 text-xs text-[#9ca3af] transition-colors hover:text-[#6b7280]"
                  >
                    ← Back
                  </button>

                  {/* Connection target */}
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#faf9f6] px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Connecting to</p>
                    <p className="mt-1 font-mono text-sm text-[#1a1a1a]">
                      {parseHost(getFinalConnectionString(byoConnectionString, byoRawPassword))}
                    </p>
                  </div>

                  {/* Test status */}
                  {byoStatus === "testing" && (
                    <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 text-sm text-[#6b7280]">
                      <Loader2 size={18} className="animate-spin text-[#F97316]" />
                      Testing connection…
                    </div>
                  )}
                  {byoStatus === "test_ok" && (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                      <CheckCircle size={18} className="flex-shrink-0" />
                      Connected to {parseHost(getFinalConnectionString(byoConnectionString, byoRawPassword))}
                    </div>
                  )}
                  {byoStatus === "test_fail" && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
                      <div className="flex items-center gap-3 text-sm font-medium text-red-700">
                        <XCircle size={18} className="flex-shrink-0" />
                        Connection failed
                      </div>
                      {byoTestError && (
                        <p className="mt-2 pl-7 text-xs text-red-600">{byoTestError}</p>
                      )}
                    </div>
                  )}
                  {byoSaveError && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      <XCircle size={15} className="mt-0.5 flex-shrink-0" />
                      <span>{byoSaveError}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    {byoStatus === "test_fail" && (
                      <button
                        type="button"
                        onClick={() => void handleTestByo()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#faf9f6]"
                      >
                        <Database size={14} />
                        Retry Test
                      </button>
                    )}
                    {byoStatus === "test_ok" && (
                      <button
                        type="button"
                        onClick={() => void handleSaveByo()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
                      >
                        <Zap size={14} />
                        Save & Connect
                      </button>
                    )}
                    {byoStatus === "saving" && (
                      <button disabled className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white opacity-70">
                        <Loader2 size={14} className="animate-spin" />
                        Saving…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
