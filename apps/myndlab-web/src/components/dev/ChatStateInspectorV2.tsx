/**
 * ChatStateInspectorV2 — BEO-813 / Sprint 9 Phase 3.4
 *
 * Dev-only floating inspector for the v2 chat reducer state + localStorage snapshot.
 * Receives state as props from ChatPanelV2 — no context required.
 *
 * Toggle: Cmd+Shift+K (Mac) / Ctrl+Shift+K — same binding as v1 inspector.
 * Visibility persisted in localStorage key "beomz:devInspectorV2:open".
 *
 * Gating: enabled in DEV builds OR when localStorage["beomz:devMode"] === "true".
 * forceOpen prop bypasses localStorage gate (used in dev preview).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ChatState } from "../../hooks/useBuildChatV2";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChatStateInspectorV2Props {
  projectId: string;
  state: ChatState;
  forceOpen?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OPEN_KEY = "beomz:devInspectorV2:open";
const DEV_MODE_KEY = "beomz:devMode";

const ACTIVE_PHASES = new Set([
  "classifying",
  "thinking",
  "planning",
  "building",
  "persisting",
  "summarizing",
]);

// ─── Gate ─────────────────────────────────────────────────────────────────────

function isDevPreviewEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(DEV_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtJson(val: unknown): string {
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
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

function PhaseBadge({ phase }: { phase: string }) {
  let cls: string;
  if (ACTIVE_PHASES.has(phase)) {
    cls = "rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30";
  } else if (phase === "awaiting_implement") {
    cls = "rounded px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30";
  } else if (phase === "error" || phase === "failed") {
    cls = "rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30";
  } else {
    cls = "rounded px-1.5 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700";
  }
  return <span className={cls}>{phase}</span>;
}

function SectionHeader({
  title,
  open,
  onToggle,
  mismatch,
  badge,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  mismatch?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[#a1a1a1] hover:text-white transition-colors border-b border-[#2a2a2a]"
    >
      <span className="text-[10px]">{open ? "▼" : "▶"}</span>
      <span>{title}</span>
      {badge}
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

// ─── Section A — Reducer state ────────────────────────────────────────────────

function ReducerStateSection({ state }: { state: ChatState }) {
  const snapshot = {
    phase: state.phase,
    turnId: state.turnId ? state.turnId.slice(0, 8) + "…" : null,
    messagesCount: state.messages.length,
    currentAction: state.currentAction ? { label: state.currentAction.label } : null,
    pendingPlan: state.pendingPlan ? { summary: state.pendingPlan.summary } : null,
    error: state.error ? { code: state.error.code, message: state.error.message } : null,
  };

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#6b7280]">
          {state.messages.length} messages · phase: {state.phase}
        </span>
        <CopyBtn text={fmtJson(snapshot)} />
      </div>
      <JsonBlock data={snapshot} />
    </div>
  );
}

// ─── Section B — Messages ─────────────────────────────────────────────────────

function MessagesSection({ state }: { state: ChatState }) {
  const { messages } = state;

  function truncate(s: string, n = 60): string {
    return s.length <= n ? s : s.slice(0, n) + "…";
  }

  function msgContent(m: { type: string; content: string }): string {
    if (m.type === "build_summary") return "✓ " + (m.content || "Build summary");
    if (m.type === "error") return m.content;
    return m.content;
  }

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#6b7280]">{messages.length} messages</span>
        <CopyBtn text={JSON.stringify(messages, null, 2)} />
      </div>
      <div className="space-y-0.5">
        {messages.map((m) => {
          const isStreaming = m.streaming;
          const roleColor = m.role === "user" ? "text-[#a1a1a1]" : "text-[#d4d4d4]";
          const roleStr = m.role === "user" ? "user" : "asst";
          const typeStr = m.type.slice(0, 14).padEnd(14, " ");
          const streamInd = isStreaming ? "⟳" : " ";
          const content = truncate(msgContent(m));

          return (
            <div
              key={m.id}
              className={`font-mono text-[10px] flex gap-1 ${roleColor}`}
            >
              <span className="w-[28px] shrink-0">{roleStr}</span>
              <span className="w-[100px] shrink-0 truncate">{typeStr}</span>
              <span className={`w-[12px] shrink-0 ${isStreaming ? "text-[#F97316]" : ""}`}>
                {streamInd}
              </span>
              <span className="text-[#6b7280] shrink-0">—</span>
              <span className="truncate">{content}</span>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-[10px] text-[#6b7280]">no messages</p>
        )}
      </div>
    </div>
  );
}

// ─── Section C — localStorage snapshot ───────────────────────────────────────

interface SnapshotData {
  snapshotPhase: string | null;
  snapshotMessageCount: number;
  lastTwoMessages: Array<{
    type: string;
    role: string;
    content: string;
  }>;
  _raw: unknown;
}

function StorageSnapshotSection({
  projectId,
  state,
}: {
  projectId: string;
  state: ChatState;
}) {
  const [snap, setSnap] = useState<SnapshotData>({
    snapshotPhase: null,
    snapshotMessageCount: 0,
    lastTwoMessages: [],
    _raw: null,
  });

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem(`chat:v2:${projectId}`);
      if (!raw) {
        setSnap({ snapshotPhase: null, snapshotMessageCount: 0, lastTwoMessages: [], _raw: null });
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const msgs = Array.isArray(parsed?.messages) ? parsed.messages as Array<Record<string, unknown>> : [];
      const phase = typeof parsed?.phase === "string" ? parsed.phase : null;

      setSnap({
        snapshotPhase: phase,
        snapshotMessageCount: msgs.length,
        lastTwoMessages: msgs.slice(-2).map((m) => ({
          type: typeof m.type === "string" ? m.type : "",
          role: typeof m.role === "string" ? m.role : "",
          content:
            typeof m.content === "string" ? m.content.slice(0, 60) : "(none)",
        })),
        _raw: parsed,
      });
    } catch {
      setSnap({ snapshotPhase: null, snapshotMessageCount: 0, lastTwoMessages: [], _raw: null });
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const mismatch =
    snap.snapshotMessageCount !== state.messages.length ||
    (snap.snapshotPhase !== null && snap.snapshotPhase !== state.phase);

  const [openSnap, setOpenSnap] = useState(false);

  const display = {
    snapshotPhase: snap.snapshotPhase,
    snapshotMessageCount: snap.snapshotMessageCount,
    lastTwoMessages: snap.lastTwoMessages,
  };

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#6b7280]">
          polling every 1s · key: chat:v2:{projectId}
          {mismatch && (
            <span className="ml-2 text-red-400 font-bold">MISMATCH</span>
          )}
        </span>
        <CopyBtn text={fmtJson(display)} />
      </div>
      <JsonBlock data={display} />
      <button
        onClick={() => setOpenSnap(v => !v)}
        className="text-[10px] text-[#F97316] hover:underline"
      >
        {openSnap ? "▼ hide raw snapshot" : "▶ show raw snapshot"}
      </button>
      {openSnap && <JsonBlock data={snap._raw} />}
    </div>
  );
}

// ─── Main inspector ───────────────────────────────────────────────────────────

export function ChatStateInspectorV2({ projectId, state, forceOpen }: ChatStateInspectorV2Props) {
  if (!forceOpen && !isDevPreviewEnabled()) return null;
  return <InspectorInner projectId={projectId} state={state} forceOpen={forceOpen} />;
}

function InspectorInner({
  projectId,
  state,
  forceOpen,
}: ChatStateInspectorV2Props) {
  const [open, setOpen] = useState(() => {
    if (forceOpen) return true;
    try { return localStorage.getItem(OPEN_KEY) === "true"; } catch { return false; }
  });

  const [openReducer, setOpenReducer] = useState(true);
  const [openMessages, setOpenMessages] = useState(true);
  const [openStorage, setOpenStorage] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const [width, setWidth] = useState(420);
  const resizingRef = useRef(false);

  const toggleOpen = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(OPEN_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = (e.key || "").toLowerCase();
      if (key === "k" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleOpen]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = startX - ev.clientX;
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

  // Header mismatch: localStorage snapshot msg count vs reducer msg count
  const [headerMismatch, setHeaderMismatch] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem(`chat:v2:${projectId}`);
        if (!raw) { setHeaderMismatch(false); return; }
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const msgs = Array.isArray(parsed?.messages) ? parsed.messages : [];
        setHeaderMismatch(msgs.length !== state.messages.length);
      } catch { setHeaderMismatch(false); }
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [projectId, state.messages.length]);

  if (!open) {
    return (
      <button
        onClick={toggleOpen}
        title="Open chat state inspector v2 (Cmd+Shift+K)"
        className="fixed bottom-3 right-3 z-[9998] flex h-6 w-6 items-center justify-center rounded-full bg-[#F97316] text-[10px] font-bold text-white shadow-lg hover:bg-[#ea6b15] transition-colors"
        aria-label="Open chat state inspector v2"
      >
        🔍
      </button>
    );
  }

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
          DEV · CHAT V2
        </span>
        <span
          className="text-[10px] text-[#6b7280] font-mono truncate max-w-[120px]"
          title={projectId}
        >
          {projectId.slice(0, 8)}…
        </span>
        {headerMismatch && (
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
            title="Close (Cmd+Shift+K)"
          >
            ✕
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-y-auto flex-1 divide-y divide-[#2a2a2a]">
          {/* Section A: Reducer state */}
          <div>
            <SectionHeader
              title="Reducer state"
              open={openReducer}
              onToggle={() => setOpenReducer(v => !v)}
              badge={<PhaseBadge phase={state.phase} />}
            />
            {openReducer && <ReducerStateSection state={state} />}
          </div>

          {/* Section B: Messages */}
          <div>
            <SectionHeader
              title="Messages"
              open={openMessages}
              onToggle={() => setOpenMessages(v => !v)}
            />
            {openMessages && <MessagesSection state={state} />}
          </div>

          {/* Section C: localStorage snapshot */}
          <div>
            <SectionHeader
              title="localStorage snapshot"
              open={openStorage}
              onToggle={() => setOpenStorage(v => !v)}
              mismatch={headerMismatch}
            />
            {openStorage && (
              <StorageSnapshotSection projectId={projectId} state={state} />
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1 bg-[#0f0f0f] border-t border-[#2a2a2a] text-[9px] text-[#4a4a4a] flex items-center justify-between">
        <span>⌘⇧K to toggle · v2 inspector</span>
        <span className="font-mono">DEV ONLY</span>
      </div>
    </div>
  );
}
