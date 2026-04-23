/**
 * DatabasePanel — BEO-537 (Supabase OAuth UX rework).
 *
 * One panel, three states, one-way managed → BYO upgrade.
 *
 * State 1 — No DB connected      → two side-by-side cards (no tabs)
 *                                   "Add database"             → inline Neon provision
 *                                   "Connect Supabase →"       → popup-OAuth modal (step 1)
 *                                   "Connect manually →"       → URL + Anon Key form
 * State 2 — Managed (Neon)       → header + "Upgrade to BYO →" link + Data tabs
 * State 3 — BYO (Supabase)       → header + Data tabs (no downgrade)
 *
 * OAuth connect modal (State 1 → State 3):
 *   Step 1: "Continue with Supabase" → window.open popup (no redirect).
 *           Popup posts { type: 'supabase_oauth_success', projectId } on success.
 *   Step 2: Project picker (fetched from GET /integrations/supabase/projects).
 *           "Connect this project" → POST /integrations/supabase/connect.
 *   On success: close modal, inject SUPABASE_WIRING_PROMPT into chat (same
 *   mechanism as managed Neon's WIRING_PROMPT), fire it immediately. The
 *   chat-based iteration shows progress — no silent polling here.
 *
 * Upgrade (State 2 → State 3):
 *   Modal (min-height faux viewport, NOT position:fixed)
 *   → POST /api/projects/:id/upgrade-to-byo
 *   → poll getLatestBuildForProject every 3s (up to 120s)
 *   → Progress A (Migrating…) → B (Rewiring…) → C (✅ Upgraded)
 *   → Finally shows State 3. No downgrade option, ever.
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
  Plug,
  Table2,
  Layers,
  HardDrive,
  Users,
  Eye,
  EyeOff,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  X,
} from "lucide-react";
import { cn } from "../../lib/cn";
import {
  enableDatabase,
  getDbSchema,
  getDbRows,
  runDbMigration,
  getDbUsage,
  getStorageAddons,
  createStorageAddonCheckout,
  connectSupabaseDb,
  getSupabaseOAuthProjects,
  connectSupabaseOAuth,
  getLatestBuildForProject,
  getApiBaseUrl,
  getAccessToken,
  type DbTable,
  type StorageAddonInfo,
  type SupabaseOAuthProject,
} from "../../lib/api";

type PanelTab = "schema" | "data" | "users" | "storage";
type SubFlow = null | "supabase";
type UpgradePhase = "idle" | "migrating" | "rewiring" | "done";
type ConnectModalStep = "oauth" | "projects";

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

/**
 * BEO-537: Rewire prompt injected into chat after BYO Supabase connect
 * (both OAuth popup flow and manual URL+key form). Mirrors the pattern
 * used by WIRING_PROMPT for managed Neon provisioning.
 */
const SUPABASE_WIRING_PROMPT = `Rewire the entire app to use Supabase. Import createClient from "@supabase/supabase-js" and use import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY. Replace all hardcoded data with real Supabase queries. Use useEffect + useState for loading and error states.`;

function formatStorageMb(mb: number): string {
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
}

function shortProjectId(projectId: string | null): string {
  if (!projectId) return "";
  return projectId.slice(0, 8);
}

async function upgradeToByo(
  projectId: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<void> {
  const token = await getAccessToken();
  const resp = await fetch(`${getApiBaseUrl()}/projects/${projectId}/upgrade-to-byo`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ supabaseUrl, supabaseAnonKey }),
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Upgrade failed with ${resp.status}.`);
  }
}

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
  onDbStateChange,
  onWireToDatabase,
  byoConnectedHost,
  plan: _plan,
}: DatabasePanelProps) {
  void _plan;

  // ── Top-level state classification ────────────────────
  const isByoConnected = dbProvider === "byo" || dbProvider === "supabase";
  const isManagedConnected = databaseEnabled && !isByoConnected;

  // ── Sub-flows on State 1 ──────────────────────────────
  const [subFlow, setSubFlow] = useState<SubFlow>(null);

  // ── Neon provisioning (State 1 → State 2) ─────────────
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  // ── Supabase connect form (State 1 → State 3) ─────────
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [showAnonKey, setShowAnonKey] = useState(false);
  const [byoConnecting, setByoConnecting] = useState(false);
  const [byoConnectError, setByoConnectError] = useState<string | null>(null);
  const [byoSavedHost, setByoSavedHost] = useState<string | null>(byoConnectedHost ?? null);

  // ── BEO-537: OAuth connect modal state ────────────────
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ConnectModalStep>("oauth");
  const [popupOpening, setPopupOpening] = useState(false);
  const [popupClosedError, setPopupClosedError] = useState<string | null>(null);
  const [oauthProjects, setOauthProjects] = useState<SupabaseOAuthProject[]>([]);
  const [oauthProjectsLoading, setOauthProjectsLoading] = useState(false);
  const [oauthProjectsError, setOauthProjectsError] = useState<string | null>(null);
  const [selectedOauthRef, setSelectedOauthRef] = useState("");
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [oauthConnectError, setOauthConnectError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const popupWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── BEO-532: setup SQL helper after BYO rewire ──
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [setupSqlDismissed, setSetupSqlDismissed] = useState(false);
  const [setupSqlCopied, setSetupSqlCopied] = useState(false);
  const setupSqlCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Upgrade modal + progress ──────────────────────────
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeUrl, setUpgradeUrl] = useState("");
  const [upgradeAnonKey, setUpgradeAnonKey] = useState("");
  const [upgradeShowKey, setUpgradeShowKey] = useState(false);
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);
  const [upgradePhase, setUpgradePhase] = useState<UpgradePhase>("idle");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const upgradePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upgradePhaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upgradeStartRef = useRef<number>(0);

  // ── Tabs (State 2 + State 3 data surface) ─────────────
  const [activeTab, setActiveTab] = useState<PanelTab>("schema");

  // ── Schema ────────────────────────────────────────────
  const [schemaTables, setSchemaTables] = useState<DbTable[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  // ── Data tab ──────────────────────────────────────────
  const [dataTable, setDataTable] = useState("");
  const [dataRows, setDataRows] = useState<Record<string, unknown>[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataWriteError, setDataWriteError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; column: string } | null>(null);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});

  // ── Users tab ─────────────────────────────────────────
  const [usersRows, setUsersRows] = useState<Record<string, unknown>[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // ── Storage usage (managed only) ──────────────────────
  const [dbUsage, setDbUsage] = useState<{ used_mb: number; limits: { storage_mb: number } } | null>(null);
  const [dbUsageLoading, setDbUsageLoading] = useState(false);
  const [dbUsageError, setDbUsageError] = useState(false);
  const [addons, setAddons] = useState<StorageAddonInfo[] | null>(null);
  const [addonsLoading, setAddonsLoading] = useState(true);

  // ── Toast ─────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const selectedTableSchema = useMemo(
    () => schemaTables.find((t) => t.table_name === dataTable) ?? null,
    [schemaTables, dataTable],
  );
  const editableCols = useMemo(
    () =>
      (selectedTableSchema?.columns ?? []).filter(
        (c) => c.name !== "id" && c.name !== "created_at" && c.name !== "updated_at",
      ),
    [selectedTableSchema],
  );

  // ── Sync byoSavedHost when prop changes ───────────────
  useEffect(() => {
    if (byoConnectedHost) setByoSavedHost(byoConnectedHost);
  }, [byoConnectedHost]);

  // ── Data fetchers ─────────────────────────────────────
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

  const fetchRows = useCallback(
    async (table: string) => {
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
    },
    [projectId],
  );

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

  const runMigrationSafe = useCallback(
    async (sql: string) => {
      if (!projectId) return;
      await runDbMigration(projectId, sql);
    },
    [projectId],
  );

  // ── Row CRUD ──────────────────────────────────────────
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

  const handleUpdateCell = useCallback(
    async (rowIdx: number, column: string, value: string) => {
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
    },
    [projectId, dataTable, dataRows, fetchRows, runMigrationSafe],
  );

  const handleDeleteRow = useCallback(
    async (rowIdx: number) => {
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
    },
    [projectId, dataTable, dataRows, fetchRows, runMigrationSafe],
  );

  const handleCopySetupSql = useCallback(async () => {
    if (!setupSql) return;
    try {
      await navigator.clipboard.writeText(setupSql);
      setSetupSqlCopied(true);
      if (setupSqlCopyTimerRef.current) clearTimeout(setupSqlCopyTimerRef.current);
      setupSqlCopyTimerRef.current = setTimeout(() => setSetupSqlCopied(false), 2000);
    } catch {
      showToast("Couldn't copy — select the SQL manually.");
    }
  }, [setupSql, showToast]);

  const handleStorageAddon = useCallback(
    async (priceId: string) => {
      if (!projectId) return;
      try {
        const { url } = await createStorageAddonCheckout(priceId, projectId);
        window.location.href = url;
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to open checkout.");
      }
    },
    [projectId, showToast],
  );

  // ── State 1 — "Add database" (Neon provision) ─────────
  const handleEnable = useCallback(async () => {
    if (!projectId) return;
    setEnabling(true);
    setEnableError(null);
    try {
      await enableDatabase(projectId);
      onDbStateChange();
      setTimeout(() => {
        onWireToDatabase?.(WIRING_PROMPT);
      }, 1200);
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : "Failed to provision database.");
    } finally {
      setEnabling(false);
    }
  }, [projectId, onDbStateChange, onWireToDatabase]);

  // ── State 1 — "Connect manually" (URL + Anon Key form) ─
  const handleConnectSupabase = useCallback(async () => {
    const url = supabaseUrl.trim();
    const key = supabaseAnonKey.trim();
    if (!url || !key || !projectId) return;
    setByoConnecting(true);
    setByoConnectError(null);
    try {
      const result = await connectSupabaseDb(projectId, url, key);
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        host = url;
      }
      setByoSavedHost(host);
      if (result.setupSql && result.setupSql.trim()) {
        setSetupSql(result.setupSql);
        setSetupSqlDismissed(false);
        setSetupSqlCopied(false);
      }
      onDbStateChange();
      setSubFlow(null);
      // Same pattern as managed-Neon enableDatabase: fire the rewire prompt
      // into chat so the user watches it in the chat panel (BEO-537).
      setTimeout(() => {
        onWireToDatabase?.(SUPABASE_WIRING_PROMPT);
      }, 1200);
    } catch (err) {
      setByoConnectError(err instanceof Error ? err.message : "Failed to connect.");
    } finally {
      setByoConnecting(false);
    }
  }, [projectId, supabaseUrl, supabaseAnonKey, onDbStateChange, onWireToDatabase]);

  // ── BEO-537: Open OAuth popup ─────────────────────────
  const openOAuthPopup = useCallback(() => {
    if (!projectId) return;
    setPopupOpening(true);
    setPopupClosedError(null);
    const authorizeUrl = `${getApiBaseUrl()}/integrations/supabase/authorize?projectId=${encodeURIComponent(projectId)}`;
    const popup = window.open(
      authorizeUrl,
      "supabase_oauth",
      "width=600,height=700,scrollbars=yes",
    );
    if (!popup) {
      setPopupOpening(false);
      setPopupClosedError("Popup blocked — please allow popups for this site and try again.");
      return;
    }
    popupRef.current = popup;
    popup.focus();
    // Watch for the user closing the popup without completing OAuth.
    if (popupWatchRef.current) clearInterval(popupWatchRef.current);
    popupWatchRef.current = setInterval(() => {
      const w = popupRef.current;
      if (!w || w.closed) {
        if (popupWatchRef.current) {
          clearInterval(popupWatchRef.current);
          popupWatchRef.current = null;
        }
        popupRef.current = null;
        setPopupOpening(false);
        // Only show "closed" error if we haven't already transitioned to the
        // project picker (i.e. postMessage success fired first).
        setModalStep((current) => {
          if (current === "oauth") {
            setPopupClosedError("The popup was closed before authorization finished.");
          }
          return current;
        });
      }
    }, 500);
  }, [projectId]);

  // ── BEO-537: Listen for OAuth popup success postMessage ─
  useEffect(() => {
    if (!connectModalOpen) return;
    const apiOrigin = (() => {
      try {
        return new URL(getApiBaseUrl()).origin;
      } catch {
        return "";
      }
    })();
    function handleMessage(event: MessageEvent) {
      // Accept from either the API origin or the studio origin (callback may
      // be served from either depending on reverse-proxy setup).
      if (
        apiOrigin &&
        event.origin !== apiOrigin &&
        event.origin !== window.location.origin
      ) {
        return;
      }
      const data = event.data as { type?: string; projectId?: string } | null;
      if (!data || data.type !== "supabase_oauth_success") return;
      if (data.projectId && projectId && data.projectId !== projectId) return;

      // Close the popup if still open
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close();
        } catch {
          // popup may have closed itself already
        }
      }
      if (popupWatchRef.current) {
        clearInterval(popupWatchRef.current);
        popupWatchRef.current = null;
      }
      popupRef.current = null;
      setPopupOpening(false);
      setPopupClosedError(null);

      // Transition to project picker and load projects
      setModalStep("projects");
      if (!projectId) return;
      setOauthProjectsLoading(true);
      setOauthProjectsError(null);
      getSupabaseOAuthProjects(projectId)
        .then((projects) => {
          setOauthProjects(projects);
          if (projects.length === 1) setSelectedOauthRef(projects[0].ref);
        })
        .catch((err) => {
          setOauthProjectsError(err instanceof Error ? err.message : "Failed to load projects.");
        })
        .finally(() => setOauthProjectsLoading(false));
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [connectModalOpen, projectId]);

  // ── Open the Connect Supabase modal ───────────────────
  const handleOpenConnectModal = useCallback(() => {
    if (!projectId) return;
    setConnectModalOpen(true);
    setModalStep("oauth");
    setOauthProjects([]);
    setSelectedOauthRef("");
    setOauthProjectsError(null);
    setOauthConnectError(null);
    setPopupClosedError(null);
    setPopupOpening(false);
  }, [projectId]);

  // ── Close the Connect Supabase modal ──────────────────
  const handleCloseConnectModal = useCallback(() => {
    setConnectModalOpen(false);
    setModalStep("oauth");
    setPopupClosedError(null);
    setPopupOpening(false);
    setOauthConnectError(null);
    if (popupRef.current && !popupRef.current.closed) {
      try {
        popupRef.current.close();
      } catch {
        // ignore
      }
    }
    if (popupWatchRef.current) {
      clearInterval(popupWatchRef.current);
      popupWatchRef.current = null;
    }
    popupRef.current = null;
  }, []);

  // ── BEO-537: Connect chosen project → inject rewire prompt ─
  const handleConnectOAuth = useCallback(async () => {
    if (!projectId || !selectedOauthRef) return;
    setOauthConnecting(true);
    setOauthConnectError(null);
    try {
      const result = await connectSupabaseOAuth(projectId, selectedOauthRef);
      let host: string = selectedOauthRef + ".supabase.co";
      if (result.host) host = result.host;
      setByoSavedHost(host);
      if (result.setupSql && result.setupSql.trim()) {
        setSetupSql(result.setupSql);
        setSetupSqlDismissed(false);
        setSetupSqlCopied(false);
      }
      onDbStateChange();
      // Close modal first, then inject the rewire prompt into chat — exact
      // same pattern as managed-Neon enableDatabase + WIRING_PROMPT.
      handleCloseConnectModal();
      setTimeout(() => {
        onWireToDatabase?.(SUPABASE_WIRING_PROMPT);
      }, 300);
    } catch (err) {
      setOauthConnectError(err instanceof Error ? err.message : "Failed to connect project.");
    } finally {
      setOauthConnecting(false);
    }
  }, [projectId, selectedOauthRef, onDbStateChange, onWireToDatabase, handleCloseConnectModal]);

  // ── Upgrade submit → POST + poll ──────────────────────
  const handleConfirmUpgrade = useCallback(async () => {
    if (!projectId) return;
    const url = upgradeUrl.trim();
    const key = upgradeAnonKey.trim();
    if (!url || !key) {
      setUpgradeError("Project URL and Anon Key are required.");
      return;
    }
    setUpgradeSubmitting(true);
    setUpgradeError(null);
    try {
      await upgradeToByo(projectId, url, key);
      upgradeStartRef.current = Date.now();
      setUpgradePhase("migrating");
      // Phase A → B after 30s
      upgradePhaseTimerRef.current = setTimeout(() => {
        setUpgradePhase((prev) => (prev === "migrating" ? "rewiring" : prev));
      }, 30_000);
      // Save new host immediately for post-complete display
      try {
        setByoSavedHost(new URL(url).hostname);
      } catch {
        setByoSavedHost(url);
      }
      onDbStateChange();
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : "Upgrade failed.");
      setUpgradePhase("idle");
    } finally {
      setUpgradeSubmitting(false);
    }
  }, [projectId, upgradeUrl, upgradeAnonKey, onDbStateChange]);

  // ── Poll upgrade wire completion ──────────────────────
  useEffect(() => {
    if (upgradePhase !== "migrating" && upgradePhase !== "rewiring") return;
    if (!projectId) return;
    let cancelled = false;
    const POLL_INTERVAL_MS = 3000;
    const MAX_WAIT_MS = 120_000;

    async function poll() {
      if (cancelled) return;
      try {
        const status = await getLatestBuildForProject(projectId!);
        if (cancelled) return;
        if (status) {
          const buildStarted = new Date(status.build.startedAt).getTime();
          const isNew = buildStarted >= upgradeStartRef.current - 5000;
          if (isNew && (status.build.status === "completed" || status.build.status === "failed")) {
            setUpgradePhase("done");
            onDbStateChange();
            return;
          }
        }
        const elapsed = Date.now() - upgradeStartRef.current;
        if (elapsed < MAX_WAIT_MS) {
          upgradePollRef.current = setTimeout(() => {
            void poll();
          }, POLL_INTERVAL_MS);
        } else {
          setUpgradePhase("done");
          onDbStateChange();
        }
      } catch {
        if (!cancelled) {
          const elapsed = Date.now() - upgradeStartRef.current;
          if (elapsed < MAX_WAIT_MS) {
            upgradePollRef.current = setTimeout(() => {
              void poll();
            }, POLL_INTERVAL_MS);
          } else {
            setUpgradePhase("done");
            onDbStateChange();
          }
        }
      }
    }
    upgradePollRef.current = setTimeout(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      if (upgradePollRef.current) clearTimeout(upgradePollRef.current);
    };
  }, [upgradePhase, projectId, onDbStateChange]);

  // Cleanup phase timers on unmount
  useEffect(() => {
    return () => {
      if (upgradePhaseTimerRef.current) clearTimeout(upgradePhaseTimerRef.current);
      if (upgradePollRef.current) clearTimeout(upgradePollRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (setupSqlCopyTimerRef.current) clearTimeout(setupSqlCopyTimerRef.current);
      if (popupWatchRef.current) clearInterval(popupWatchRef.current);
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // After phase becomes "done", auto-close the modal after a short delay so
  // the user sees State 3 underneath.
  useEffect(() => {
    if (upgradePhase !== "done") return;
    const t = setTimeout(() => {
      setUpgradeOpen(false);
      setUpgradePhase("idle");
      setUpgradeUrl("");
      setUpgradeAnonKey("");
    }, 2000);
    return () => clearTimeout(t);
  }, [upgradePhase]);

  // ── Tab data-fetch side effects ───────────────────────
  useEffect(() => {
    if (!databaseEnabled && !isByoConnected) return;
    if (activeTab === "schema" || activeTab === "data") {
      void fetchSchema();
    }
  }, [databaseEnabled, isByoConnected, activeTab, fetchSchema]);

  useEffect(() => {
    if ((databaseEnabled || isByoConnected) && activeTab === "data" && dataTable) {
      void fetchRows(dataTable);
    }
  }, [databaseEnabled, isByoConnected, activeTab, dataTable, fetchRows]);

  useEffect(() => {
    if ((databaseEnabled || isByoConnected) && activeTab === "users") {
      void fetchUsers();
    }
  }, [databaseEnabled, isByoConnected, activeTab, fetchUsers]);

  useEffect(() => {
    if (isManagedConnected && activeTab === "storage") {
      void fetchDbUsage();
      void fetchAddons();
    }
  }, [isManagedConnected, activeTab, fetchDbUsage, fetchAddons]);

  // ── Derived storage stats ─────────────────────────────
  const usedMb = dbUsage?.used_mb ?? 0;
  const limitMb = dbUsage?.limits.storage_mb ?? 500;
  const fillPct = limitMb > 0 ? Math.min((usedMb / limitMb) * 100, 100) : 0;
  const barColorClass = fillPct > 90 ? "bg-red-500" : fillPct > 80 ? "bg-amber-500" : "bg-[#F97316]";

  const INNER_TAB_ITEMS: { key: PanelTab; icon: typeof Table2; label: string; managedOnly?: boolean }[] = [
    { key: "schema", icon: Layers, label: "Schema" },
    { key: "data", icon: Table2, label: "Data" },
    { key: "users", icon: Users, label: "Users" },
    { key: "storage", icon: HardDrive, label: "Storage", managedOnly: true },
  ];

  const visibleTabs = INNER_TAB_ITEMS.filter((t) => !t.managedOnly || isManagedConnected);

  // ── RENDER ────────────────────────────────────────────

  // STATE 3 — BYO Supabase connected (also shown after upgrade completes)
  if (isByoConnected) {
    const showSetupSql = !!setupSql && !setupSqlDismissed;
    return (
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        {showSetupSql && renderSetupSqlHelper()}
        <ConnectedHeader
          kind="byo"
          label={byoSavedHost ?? byoConnectedHost ?? "Supabase"}
          onUpgradeClick={null}
        />
        {renderTabBar(visibleTabs, activeTab, setActiveTab, usersRows.length)}
        <div className="flex-1 overflow-y-auto p-4">
          {renderTabContent()}
        </div>
        {renderAddRowModal()}
        {renderToast()}
      </div>
    );
  }

  // STATE 2 — Managed (Neon) connected
  if (isManagedConnected) {
    return (
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        {upgradeOpen ? (
          renderUpgradeModal()
        ) : (
          <>
            <ConnectedHeader
              kind="managed"
              label={`Beomz database · ${shortProjectId(projectId)}`}
              onUpgradeClick={() => {
                setUpgradeOpen(true);
                setUpgradeError(null);
                setUpgradePhase("idle");
              }}
            />
            {renderTabBar(visibleTabs, activeTab, setActiveTab, usersRows.length)}
            <div className="flex-1 overflow-y-auto p-4">
              {renderTabContent()}
            </div>
          </>
        )}
        {renderAddRowModal()}
        {renderToast()}
      </div>
    );
  }

  // STATE 1 — No DB connected
  return (
    <div className={cn("flex h-full flex-col overflow-hidden bg-[#faf9f6]", className)}>
      {subFlow === "supabase" ? renderSupabaseForm() : renderIntroCards()}
      {renderToast()}
      {connectModalOpen && renderConnectModal()}
    </div>
  );

  // ═══════════════════════════════════════════════════════
  // Render helpers
  // ═══════════════════════════════════════════════════════

  function renderIntroCards() {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        <div className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          {/* ── Card 1: Beomz database (orange accent) ── */}
          <div className="flex flex-col rounded-2xl border-2 border-[#F97316]/70 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F97316]/10">
                <Database size={22} className="text-[#F97316]" />
              </div>
              <span className="rounded-full bg-[#F97316]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#F97316]">
                Included in plan
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#1a1a1a]">Beomz database</h3>
            <p className="mt-1 text-sm text-[#6b7280]">Instant Postgres — provisioned in seconds</p>
            <p className="mt-3 text-xs text-[#9ca3af]">Isolated · Auto-scaling · Backed up daily</p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={enabling || !projectId}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
            >
              {enabling ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {enabling ? "Provisioning…" : "Add database"}
            </button>
            {enableError && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle size={12} /> {enableError}
              </p>
            )}
          </div>

          {/* ── Card 2: Connect your own (neutral/outlined) ── */}
          <div className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f3f4f6]">
                <Plug size={22} className="text-[#374151]" />
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-[#edfaf4] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#3ecf8e]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3ecf8e]" />
                Supabase
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#1a1a1a]">Connect your own</h3>
            <p className="mt-1 text-sm text-[#6b7280]">Bring your existing Supabase project</p>
            <p className="mt-3 text-xs text-[#9ca3af]">Full control · Your data · Your billing</p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleOpenConnectModal}
              disabled={!projectId}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#1a1a1a] bg-white px-4 py-3 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50"
            >
              Connect Supabase
              <ArrowRight size={14} />
            </button>
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setSubFlow("supabase")}
                disabled={!projectId}
                className="text-xs text-[#9ca3af] underline underline-offset-2 transition-colors hover:text-[#6b7280] disabled:opacity-50"
              >
                Connect manually →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderConnectModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-7 shadow-2xl">
          <button
            type="button"
            onClick={handleCloseConnectModal}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
          >
            <X size={16} />
          </button>

          {modalStep === "oauth" && (
            <>
              <div className="mb-5 flex items-center gap-3">
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                  style={{ backgroundColor: "#edfaf4", color: "#3ecf8e" }}
                >
                  S
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[#1a1a1a]">
                    Connect your Supabase project
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6b7280]">
                    Authorize Beomz to access your Supabase account.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openOAuthPopup}
                disabled={!projectId || popupOpening}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: "#3ecf8e" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#34b77a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#3ecf8e";
                }}
              >
                {popupOpening ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span className="text-base font-bold leading-none">S</span>
                )}
                {popupOpening ? "Waiting for authorization…" : "Continue with Supabase"}
              </button>
              <p className="mt-2 text-center text-[11px] text-[#9ca3af]">
                You'll be asked to authorize Beomz in a popup
              </p>

              {popupClosedError && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
                  <XCircle size={13} className="mt-0.5 flex-shrink-0" />
                  {popupClosedError}
                </div>
              )}
            </>
          )}

          {modalStep === "projects" && (
            <>
              <div className="mb-5 flex items-center gap-3">
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                  style={{ backgroundColor: "#edfaf4", color: "#3ecf8e" }}
                >
                  S
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[#1a1a1a]">Choose a project</h2>
                  <p className="mt-0.5 text-xs text-[#6b7280]">
                    Link a Supabase project to this app.
                  </p>
                </div>
              </div>

              {oauthProjectsLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-[#9ca3af]" />
                </div>
              )}

              {oauthProjectsError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {oauthProjectsError}
                </div>
              )}

              {!oauthProjectsLoading &&
                !oauthProjectsError &&
                oauthProjects.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#faf9f6] p-6 text-center">
                    <p className="text-sm font-medium text-[#6b7280]">No projects found</p>
                    <p className="mt-1 text-xs text-[#9ca3af]">
                      Make sure your Supabase account has at least one project.
                    </p>
                  </div>
                )}

              {!oauthProjectsLoading && oauthProjects.length > 0 && (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {oauthProjects.map((project) => (
                    <button
                      key={project.ref}
                      type="button"
                      onClick={() => setSelectedOauthRef(project.ref)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                        selectedOauthRef === project.ref
                          ? "border-[#F97316]/60 bg-[#F97316]/5 ring-2 ring-[#F97316]/10"
                          : "border-[#e5e7eb] bg-white hover:border-[#F97316]/40 hover:bg-[#F97316]/5",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1a1a1a]">
                          {project.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#9ca3af]">
                          {project.ref} · {project.region}
                        </p>
                      </div>
                      {selectedOauthRef === project.ref && (
                        <Check size={15} className="ml-3 flex-shrink-0 text-[#F97316]" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {oauthConnectError && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {oauthConnectError}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleConnectOAuth()}
                disabled={!selectedOauthRef || oauthConnecting}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {oauthConnecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {oauthConnecting ? "Connecting…" : "Connect this project"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderSupabaseForm() {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto w-full max-w-lg space-y-5">
          <button
            type="button"
            onClick={() => {
              setSubFlow(null);
              setByoConnectError(null);
            }}
            className="flex items-center gap-1.5 text-xs text-[#9ca3af] transition-colors hover:text-[#6b7280]"
          >
            <ArrowLeft size={12} /> Back
          </button>

          <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white p-4">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-base font-bold"
              style={{ backgroundColor: "#edfaf4", color: "#3ecf8e" }}
            >
              S
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#1a1a1a]">Supabase</p>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#F97316] transition-colors hover:text-[#ea6c10]"
              >
                Where to find these? →
              </a>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#6b7280]">Project URL</label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => {
                setSupabaseUrl(e.target.value);
                setByoConnectError(null);
              }}
              placeholder="https://xxxx.supabase.co"
              className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#1a1a1a] outline-none placeholder:text-[#c4c9d4] focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
            />
            <p className="text-xs text-[#9ca3af]">Found in Project → Settings → API</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#6b7280]">Anon Key</label>
            <div className="relative">
              <input
                type={showAnonKey ? "text" : "password"}
                value={supabaseAnonKey}
                onChange={(e) => {
                  setSupabaseAnonKey(e.target.value);
                  setByoConnectError(null);
                }}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white py-2.5 pl-4 pr-20 text-sm text-[#1a1a1a] outline-none placeholder:text-[#c4c9d4] focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
              />
              <button
                type="button"
                onClick={() => setShowAnonKey((v) => !v)}
                tabIndex={-1}
                className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
              >
                {showAnonKey ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showAnonKey ? "Hide" : "Show"}</span>
              </button>
            </div>
            <p className="text-xs text-[#9ca3af]">Found in Project → Settings → API → Project API keys</p>
          </div>

          {byoConnectError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <XCircle size={14} className="mt-0.5 flex-shrink-0" />
              {byoConnectError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleConnectSupabase()}
            disabled={!supabaseUrl.trim() || !supabaseAnonKey.trim() || byoConnecting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {byoConnecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {byoConnecting ? "Connecting…" : "Connect Supabase →"}
          </button>
        </div>
      </div>
    );
  }

  function renderUpgradeModal() {
    // Faux viewport — NOT position:fixed. Fills min-height of the panel.
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[#faf9f6] px-6 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-[#e5e7eb] bg-white p-7 shadow-sm">
          {upgradePhase === "idle" && (
            <>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Upgrade to your own database</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#6b7280]">
                We'll migrate all your data to your Supabase project, then permanently delete your
                Beomz managed database. This frees up your database slot for another project. This
                cannot be undone.
              </p>

              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#6b7280]">Supabase Project URL</label>
                  <input
                    type="text"
                    value={upgradeUrl}
                    onChange={(e) => {
                      setUpgradeUrl(e.target.value);
                      setUpgradeError(null);
                    }}
                    placeholder="https://xxxx.supabase.co"
                    className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#1a1a1a] outline-none placeholder:text-[#c4c9d4] focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#6b7280]">Anon Key</label>
                  <div className="relative">
                    <input
                      type={upgradeShowKey ? "text" : "password"}
                      value={upgradeAnonKey}
                      onChange={(e) => {
                        setUpgradeAnonKey(e.target.value);
                        setUpgradeError(null);
                      }}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white py-2.5 pl-4 pr-20 text-sm text-[#1a1a1a] outline-none placeholder:text-[#c4c9d4] focus:border-[#F97316]/60 focus:ring-2 focus:ring-[#F97316]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setUpgradeShowKey((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[11px] text-[#9ca3af] transition-colors hover:text-[#6b7280]"
                    >
                      {upgradeShowKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{upgradeShowKey ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {upgradeError && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {upgradeError}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleConfirmUpgrade()}
                disabled={!upgradeUrl.trim() || !upgradeAnonKey.trim() || upgradeSubmitting}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {upgradeSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                {upgradeSubmitting ? "Starting migration…" : "Migrate & Upgrade"}
              </button>

              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUpgradeOpen(false);
                    setUpgradeError(null);
                    setUpgradeUrl("");
                    setUpgradeAnonKey("");
                  }}
                  className="text-xs text-[#9ca3af] transition-colors hover:text-[#6b7280]"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {(upgradePhase === "migrating" || upgradePhase === "rewiring") && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="relative mb-6 flex h-14 w-14 items-center justify-center">
                <span className="checklist-orb-active h-12 w-12 rounded-full bg-[#F97316]" />
              </div>
              <p className="text-base font-semibold text-[#F97316]">
                {upgradePhase === "migrating"
                  ? "Migrating your data to Supabase…"
                  : "Rewiring your app…"}
              </p>
              <p className="mt-1 text-xs text-[#9ca3af]">~30s</p>
            </div>
          )}

          {upgradePhase === "done" && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <span className="mb-4 text-4xl">✅</span>
              <p className="text-base font-semibold text-emerald-700">
                Upgraded to Supabase — your data is live
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderTabBar(
    tabs: { key: PanelTab; icon: typeof Table2; label: string }[],
    active: PanelTab,
    setActive: (t: PanelTab) => void,
    usersCount: number,
  ) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-[#e5e7eb] bg-[#faf9f6] px-4 pt-2 pb-0">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors",
              active === key
                ? "border-[#e5e7eb] bg-white text-[#1a1a1a]"
                : "border-transparent text-[#9ca3af] hover:text-[#6b7280]",
            )}
          >
            <Icon size={12} />
            {key === "users" ? `Users (${usersCount})` : label}
          </button>
        ))}
      </div>
    );
  }

  function renderTabContent() {
    if (activeTab === "schema") return renderSchemaTab();
    if (activeTab === "data") return renderDataTab();
    if (activeTab === "users") return renderUsersTab();
    if (activeTab === "storage") return renderStorageTab();
    return null;
  }

  function renderSchemaTab() {
    return (
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
            <p className="mt-1 text-xs text-[#9ca3af]">Ask Beomz to create tables in the chat panel.</p>
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
                  <div className="space-y-1 border-t border-[#e5e7eb] px-4 py-3">
                    {t.columns.map((c) => (
                      <div
                        key={`${t.table_name}-${c.name}`}
                        className="flex items-center justify-between text-xs"
                      >
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
      </div>
    );
  }

  function renderDataTab() {
    return (
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
                  <tr
                    key={rowIdx}
                    className="border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#faf9f6]"
                  >
                    {selectedTableSchema.columns.map((c) => {
                      const isEditing =
                        editingCell?.rowIdx === rowIdx && editingCell?.column === c.name;
                      const value = row[c.name];
                      return (
                        <td
                          key={`${rowIdx}-${c.name}`}
                          className="cursor-pointer px-3 py-2"
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
                              {value == null ? (
                                <span className="text-[#d1d5db]">null</span>
                              ) : (
                                String(value)
                              )}
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
      </div>
    );
  }

  function renderUsersTab() {
    return (
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
            <p className="mt-1 text-xs text-[#9ca3af]">Add auth to your app to see users here.</p>
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
                    <tr
                      key={idx}
                      className="border-b border-[#f3f4f6] last:border-b-0 hover:bg-[#faf9f6]"
                    >
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
    );
  }

  function renderStorageTab() {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#e5e7eb] bg-[#faf9f6] p-4">
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
                {limitMb > 0 && <span className="ml-1.5 text-[#d1d5db]">·</span>}
                {limitMb > 0 && <span className="ml-1.5">{Math.round(fillPct)}% used</span>}
              </span>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] text-[#9ca3af]">
            Need more storage? Add to this project.
          </p>
          <div className="flex items-center gap-2">
            {addonsLoading || addons === null
              ? ["+500MB", "+2GB", "+10GB"].map((label) => (
                  <div
                    key={label}
                    className="group relative flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-2"
                  >
                    <span className="text-[11px] font-semibold text-[#d1d5db]">{label}</span>
                  </div>
                ))
              : addons.length === 0
                ? null
                : addons.map((addon) => (
                    <button
                      key={addon.price_id}
                      onClick={() => void handleStorageAddon(addon.price_id!)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-2 text-[11px] font-medium text-[#374151] transition-colors hover:border-[#F97316]/50 hover:bg-[#F97316]/5 hover:text-[#F97316]"
                    >
                      <span className="font-semibold">{addon.label}</span>
                      <span className="text-[#9ca3af]">${addon.price_usd}</span>
                    </button>
                  ))}
          </div>
        </div>
      </div>
    );
  }

  function renderAddRowModal() {
    if (!showAddRowModal || !selectedTableSchema) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-2xl">
          <button
            onClick={() => setShowAddRowModal(false)}
            className="absolute right-4 top-4 rounded-lg p-1 text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
          >
            <XCircle size={16} />
          </button>
          <h3 className="mb-4 text-base font-semibold text-[#1a1a1a]">Add row to {dataTable}</h3>
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
    );
  }

  function renderToast() {
    if (!toast) return null;
    return (
      <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] shadow-lg">
        {toast}
      </div>
    );
  }

  function renderSetupSqlHelper() {
    if (!setupSql) return null;
    const host = byoSavedHost ?? byoConnectedHost ?? "";
    const projectRef = host.split(".")[0];
    const sqlEditorUrl = projectRef
      ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
      : "https://supabase.com/dashboard";
    return (
      <div className="flex-shrink-0 border-b border-[#e5e7eb] bg-white px-4 py-4">
        <div className="relative rounded-2xl border border-[#e5e7eb] bg-[#faf9f6] p-4">
          <button
            type="button"
            onClick={() => setSetupSqlDismissed(true)}
            aria-label="Dismiss setup SQL"
            className="absolute right-3 top-3 rounded-lg p-1 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
          >
            <X size={14} />
          </button>
          <div className="pr-6">
            <p className="text-sm font-semibold text-[#1a1a1a]">Create your tables</p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Run this SQL in your Supabase project to create the required tables.
            </p>
          </div>
          <pre className="mt-3 max-h-56 overflow-auto rounded-xl border border-[#1f2937] bg-[#0b1020] p-3 font-mono text-[11px] leading-relaxed text-[#e5e7eb]">
            {setupSql}
          </pre>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopySetupSql()}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                setupSqlCopied
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-[#e5e7eb] bg-white text-[#1a1a1a] hover:border-[#F97316]/50 hover:text-[#F97316]",
              )}
            >
              {setupSqlCopied ? <Check size={12} /> : <Copy size={12} />}
              {setupSqlCopied ? "Copied!" : "Copy SQL"}
            </button>
            <a
              href={sqlEditorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1a1a] transition-colors hover:border-[#F97316]/50 hover:text-[#F97316]"
            >
              Open Supabase SQL editor
              <ArrowRight size={12} />
            </a>
          </div>
          <p className="mt-3 text-[11px] text-[#9ca3af]">
            Already have these tables? You can skip this step.
          </p>
        </div>
      </div>
    );
  }
}

// ═══════════════════════════════════════════════════════════
// Connected header — State 2 (managed) + State 3 (BYO)
// ═══════════════════════════════════════════════════════════

function ConnectedHeader({
  kind,
  label,
  onUpgradeClick,
}: {
  kind: "managed" | "byo";
  label: string;
  onUpgradeClick: (() => void) | null;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-3">
      <span className="flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-[#1a1a1a]">
          {kind === "managed" ? "Beomz database" : `Supabase · ${label}`}
        </span>
        {kind === "managed" && label.split("· ")[1] && (
          <span className="truncate font-mono text-[11px] text-[#9ca3af]">
            {label.split("· ")[1]}
          </span>
        )}
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            kind === "managed" ? "bg-[#F97316]/10 text-[#F97316]" : "bg-emerald-50 text-emerald-700",
          )}
        >
          {kind === "managed" ? "Managed" : "BYO"}
        </span>
      </div>
      <div className="flex-1" />
      {kind === "managed" && onUpgradeClick && (
        <button
          type="button"
          onClick={onUpgradeClick}
          className="flex items-center gap-1 text-xs font-medium text-[#6b7280] transition-colors hover:text-[#F97316]"
        >
          Upgrade to BYO
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}

