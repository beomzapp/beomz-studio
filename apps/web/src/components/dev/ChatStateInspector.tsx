/**
 * ChatStateInspector — BEO-793
 *
 * Dev-only floating panel that shows all chat-panel state in real-time:
 * useBuildChat React state, localStorage, sessionStorage, and on-demand backend session_events.
 *
 * Toggle: Cmd+Shift+D (Mac) / Ctrl+Shift+D (other).
 * Visibility persisted in localStorage key "beomz:devInspector:open".
 *
 * Gating: enabled in DEV builds OR when localStorage["beomz:devMode"] === "true".
 * The localStorage flag lets you debug Vercel production builds too — set it in
 * DevTools console: localStorage.setItem("beomz:devMode", "true") then refresh.
 * State exposure: React Context (ChatDebugContext) — type-safe, no global side effects.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ChatMessage } from "@beomz-studio/contracts";
import { getLatestBuildForProject } from "../../lib/api";

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ChatDebugState {
  messages: ChatMessage[];
  implementSuggestion: { summary: string } | null;
  isBuilding: boolean;
  pid: string | null;
}

export const ChatDebugContext = createContext<ChatDebugState>({
  messages: [],
  implementSuggestion: null,
  isBuilding: false,
  pid: null,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtJson(val: unknown): string {
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function tail(s: string, n = 80): string {
  if (!s) return "";
  return s.length <= n ? s : "…" + s.slice(-n);
}

function elapsed(epochMs: number): string {
  const s = Math.round((Date.now() - epochMs) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s ago`;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#2a2a2a] text-[#a1a1a1] hover:bg-[#3a3a3a] hover:text-white transition-colors"
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
  mismatch,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  mismatch?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[#a1a1a1] hover:text-white transition-colors border-b border-[#2a2a2a]"
    >
      <span className="text-[10px]">{open ? "▼" : "▶"}</span>
      <span>{title}</span>
      {mismatch && (
        <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-900/80 text-red-300 border border-red-700">
          MISMATCH
        </span>
      )}
    </button>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = fmtJson(data);
  const isLong = text.length > 400;
  const display = isLong && !expanded ? text.slice(0, 400) + "\n…" : text;
  return (
    <div className="relative">
      <pre className="text-[10px] leading-relaxed text-[#d4d4d4] whitespace-pre-wrap break-all font-mono">
        {display}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] text-[#F97316] hover:underline"
        >
          {expanded ? "collapse" : `show all (${text.length} chars)`}
        </button>
      )}
    </div>
  );
}

// ─── Sub-sections ─────────────────────────────────────────────────────────────

function ReactStateSection({ state }: { state: ChatDebugState }) {
  const { messages, implementSuggestion, isBuilding, pid } = state;

  const msgSummary = messages.map(m => {
    const anyM = m as unknown as Record<string, unknown>;
    const content = typeof anyM.content === "string" ? anyM.content : "";
    return {
      type: m.type,
      id: (m as { id?: string }).id,
      content: tail(content),
      streaming: anyM.streaming,
      implementPlan: anyM.implementPlan ? tail(String(anyM.implementPlan)) : undefined,
      nextSteps: Array.isArray(anyM.nextSteps) ? `[${(anyM.nextSteps as unknown[]).length}]` : undefined,
      summary: anyM.summary ? tail(String(anyM.summary)) : undefined,
    };
  });

  const data = {
    pid,
    isBuilding,
    messagesCount: messages.length,
    messageTypes: messages.map(m => m.type),
    messages: msgSummary,
    implementSuggestion,
  };

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#6b7280]">
          {messages.length} messages · {isBuilding ? "building" : "idle"}
        </span>
        <CopyBtn text={fmtJson(data)} />
      </div>
      <JsonBlock data={data} />
    </div>
  );
}

function StorageSection({ pid, reactMsgCount, reactLastSummary }: {
  pid: string | null;
  reactMsgCount: number;
  reactLastSummary: string | null;
}) {
  const [storageData, setStorageData] = useState<{
    chatStore: unknown;
    buildingUi: unknown;
    buildStartedAt: { raw: string | null; elapsed: string | null } | null;
    mismatch: boolean;
  }>({ chatStore: null, buildingUi: null, buildStartedAt: null, mismatch: false });

  const refresh = useCallback(() => {
    if (!pid) {
      setStorageData({ chatStore: null, buildingUi: null, buildStartedAt: null, mismatch: false });
      return;
    }
    let chatStore: unknown = null;
    let mismatch = false;
    try {
      const raw = localStorage.getItem(`chat:${pid}`);
      if (raw) {
        chatStore = JSON.parse(raw) as unknown;
        const msgs = Array.isArray(chatStore)
          ? chatStore
          : (chatStore as Record<string, unknown>)?.messages;
        const count = Array.isArray(msgs) ? msgs.length : 0;
        if (count !== reactMsgCount) mismatch = true;

        // Check if last build_summary matches react's (basic string match)
        const buildSummaries = Array.isArray(msgs)
          ? (msgs as Array<Record<string, unknown>>).filter(m => m.type === "build_summary")
          : [];
        const lsLastSummary = buildSummaries.length > 0
          ? String((buildSummaries[buildSummaries.length - 1] as Record<string, unknown>)?.content ?? "")
          : null;
        if (lsLastSummary && reactLastSummary && lsLastSummary !== reactLastSummary) {
          mismatch = true;
        }
      }
    } catch { /* ignore */ }

    let buildingUi: unknown = null;
    try {
      const raw = sessionStorage.getItem(`beomz:buildingUi:${pid}`);
      if (raw) buildingUi = JSON.parse(raw) as unknown;
    } catch { /* ignore */ }

    let buildStartedAt: { raw: string | null; elapsed: string | null } | null = null;
    try {
      const raw = sessionStorage.getItem(`beomz:buildStartedAt:${pid}`);
      if (raw) {
        const n = parseInt(raw, 10);
        buildStartedAt = { raw, elapsed: isNaN(n) ? null : elapsed(n) };
      }
    } catch { /* ignore */ }

    setStorageData({ chatStore, buildingUi, buildStartedAt, mismatch });
  }, [pid, reactMsgCount, reactLastSummary]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("chat:") || e.key?.startsWith("beomz:")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const data = {
    [`localStorage[chat:${pid ?? "?"}]`]: storageData.chatStore,
    [`sessionStorage[beomz:buildingUi:${pid ?? "?"}]`]: storageData.buildingUi,
    [`sessionStorage[beomz:buildStartedAt:${pid ?? "?"}]`]: storageData.buildStartedAt,
  };

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#6b7280]">polling every 1s</span>
        <CopyBtn text={fmtJson(data)} />
      </div>
      <JsonBlock data={data} />
    </div>
  );
}

interface BackendData {
  status: unknown;
  sessionEventsCount: number;
  sessionEventTypes: string[];
  sessionEvents: Array<{ type: unknown; contentTail: string }>;
}

function BackendSection({ pid }: { pid: string | null }) {
  const [data, setData] = useState<BackendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!pid) { setError("No project ID yet"); return; }
    setLoading(true);
    setError(null);
    try {
      const status = await getLatestBuildForProject(pid);
      if (!status) { setData(null); setError("No build found"); return; }
      const events = (status.build.sessionEvents ?? []) as Array<Record<string, unknown>>;
      setData({
        status: status.build.status,
        sessionEventsCount: events.length,
        sessionEventTypes: events.map(e => String(e.type ?? "")),
        sessionEvents: events.map(e => ({
          type: e.type,
          contentTail: typeof e.content === "string" ? tail(e.content) : "(no content)",
        })),
      });
      setLastFetchAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [pid]);

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => { void refetch(); }}
          disabled={loading || !pid}
          className="rounded px-2 py-0.5 text-[10px] font-medium bg-[#F97316]/20 text-[#F97316] border border-[#F97316]/30 hover:bg-[#F97316]/30 disabled:opacity-40 transition-colors"
        >
          {loading ? "loading…" : "↻ Refetch"}
        </button>
        {lastFetchAt && (
          <span className="text-[10px] text-[#6b7280]">{elapsed(lastFetchAt)}</span>
        )}
        {data && <CopyBtn text={fmtJson(data)} />}
      </div>
      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}
      {data && <JsonBlock data={data} />}
      {!data && !error && (
        <p className="text-[10px] text-[#6b7280]">click Refetch to load backend state</p>
      )}
    </div>
  );
}

// ─── Main inspector ───────────────────────────────────────────────────────────

const OPEN_KEY = "beomz:devInspector:open";
const DEV_MODE_KEY = "beomz:devMode";

function isDevModeEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(DEV_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function ChatStateInspector() {
  // BEO-794: gate on DEV build OR localStorage flag so the panel can be
  // enabled in Vercel production builds for live debugging without redeploying.
  // Set via DevTools: localStorage.setItem("beomz:devMode", "true"); then refresh.
  if (!isDevModeEnabled()) return null;

  return <InspectorInner />;
}

function InspectorInner() {
  const state = useContext(ChatDebugContext);
  const { messages, isBuilding, pid } = state;

  // Visibility — persisted in localStorage
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) === "true"; } catch { return false; }
  });

  // Section collapse state
  const [openReact, setOpenReact] = useState(true);
  const [openStorage, setOpenStorage] = useState(true);
  const [openBackend, setOpenBackend] = useState(true);

  // Collapsed (header only, not fully hidden)
  const [collapsed, setCollapsed] = useState(false);

  // Resize
  const [width, setWidth] = useState(420);
  const resizingRef = useRef(false);

  // Toggle via Cmd+Shift+D / Ctrl+Shift+D
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "D" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => {
          const next = !prev;
          try { localStorage.setItem(OPEN_KEY, String(next)); } catch { /* ignore */ }
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Resize handle
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = startX - ev.clientX; // drag left = grow
      setWidth(Math.max(300, Math.min(800, startW + delta)));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  // Mismatch: react msg count vs localStorage count
  const reactLastSummary = (() => {
    const summaries = messages.filter(m => m.type === "build_summary");
    if (summaries.length === 0) return null;
    const last = summaries[summaries.length - 1] as unknown as Record<string, unknown>;
    return typeof last.content === "string" ? last.content : null;
  })();

  const [storageCount, setStorageCount] = useState<number | null>(null);
  useEffect(() => {
    if (!pid) return;
    const read = () => {
      try {
        const raw = localStorage.getItem(`chat:${pid}`);
        if (!raw) { setStorageCount(null); return; }
        const parsed = JSON.parse(raw) as unknown;
        const msgs = Array.isArray(parsed)
          ? parsed
          : (parsed as Record<string, unknown>)?.messages;
        setStorageCount(Array.isArray(msgs) ? msgs.length : null);
      } catch { setStorageCount(null); }
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [pid]);

  const storageMismatch =
    storageCount !== null && storageCount !== messages.length;

  if (!open) return null;

  return (
    <div
      className="fixed top-3 right-3 z-[9999] flex flex-col rounded-xl border border-[#3a3a3a] bg-[#141414] shadow-2xl text-white overflow-hidden"
      style={{ width, maxHeight: "80vh" }}
    >
      {/* Resize handle on left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#F97316]/30 transition-colors z-10"
        onMouseDown={startResize}
      />

      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border-b border-[#2a2a2a] select-none">
        <span className="text-[11px] font-bold text-[#F97316] tracking-wide">
          DEV · CHAT STATE
        </span>
        {pid && (
          <span className="text-[10px] text-[#6b7280] font-mono truncate max-w-[120px]" title={pid}>
            {pid.slice(0, 8)}…
          </span>
        )}
        {storageMismatch && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-900/80 text-red-300 border border-red-700 ml-1">
            MISMATCH
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setCollapsed(v => !v)}
            className="rounded px-1.5 py-0.5 text-[10px] text-[#6b7280] hover:text-white hover:bg-[#2a2a2a] transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "⬆" : "⬇"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              try { localStorage.setItem(OPEN_KEY, "false"); } catch { /* ignore */ }
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-[#6b7280] hover:text-red-400 hover:bg-[#2a2a2a] transition-colors"
            title="Close (Cmd+Shift+D)"
          >
            ✕
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-y-auto flex-1 divide-y divide-[#2a2a2a]">
          {/* Section A: React state */}
          <div>
            <SectionHeader
              title="React state"
              open={openReact}
              onToggle={() => setOpenReact(v => !v)}
              mismatch={storageMismatch}
            />
            {openReact && (
              <ReactStateSection state={state} />
            )}
          </div>

          {/* Section B: Browser storage */}
          <div>
            <SectionHeader
              title="Browser storage"
              open={openStorage}
              onToggle={() => setOpenStorage(v => !v)}
              mismatch={storageMismatch}
            />
            {openStorage && (
              <StorageSection
                pid={pid}
                reactMsgCount={messages.length}
                reactLastSummary={reactLastSummary}
              />
            )}
          </div>

          {/* Section C: Backend */}
          <div>
            <SectionHeader
              title="Backend latestBuild"
              open={openBackend}
              onToggle={() => setOpenBackend(v => !v)}
            />
            {openBackend && <BackendSection pid={pid} />}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1 bg-[#0f0f0f] border-t border-[#2a2a2a] text-[9px] text-[#4a4a4a] flex items-center justify-between">
        <span>⌘⇧D to toggle · {isBuilding ? "🟠 building" : "⚪ idle"}</span>
        <span className="font-mono">DEV ONLY</span>
      </div>
    </div>
  );
}
