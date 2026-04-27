/**
 * PublishModal — beomz.app (Vercel CDN) deploy, custom domains, and export.
 *
 * BEO-556: Custom-domain UI (Starter+ gated) lets users connect their own
 * domain(s) to the published app. Adds a verification card with the TXT
 * record from Vercel, a manual "Check verification" button, 30s background
 * polling (up to 10 min), plus Visit/Remove once verified.
 *
 * BEO-559: Custom domain appears on the main view when the project already
 * has a beomz.app URL — not only after the Vercel success screen.
 *
 * BEO-571: WebContainer (slug.beomz.ai) publish option removed; preview stays
 * in the builder; only Vercel CDN is offered as Beomz-managed hosting.
 *
 * BEO-576: custom_domain + domain_status read from DB-backed project record so
 * the Live tag persists through page refresh. State 2 ("DNS setup") → "active"
 * transition is persisted server-side via GET /domains once Vercel confirms
 * domain verification.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Globe,
  Copy,
  Check,
  ExternalLink,
  Loader,
  X,
  Link2Off,
  RefreshCw,
  Lock,
  Plus,
  Download,
} from "lucide-react";
import {
  deployToVercel,
  getVercelDeployStatus,
  unpublishVercel,
  listCustomDomains,
  addCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  deleteActiveDomain,
  type CustomDomain,
} from "../../lib/api";
import { usePricingModal } from "../../contexts/PricingModalContext";

interface PublishModalProps {
  projectId: string;
  beomzAppUrl?: string | null;
  /** BEO-556: user's plan — gates custom-domain UI. "free" shows locked state. */
  plan?: string;
  /** BEO-576: active custom domain from DB project record. */
  customDomain?: string | null;
  /** BEO-576: 'active' when domain is confirmed live (DB-persisted). */
  domainStatus?: string | null;
  onClose: () => void;
  onVercelDeployed: (url: string) => void;
  onVercelUnpublished?: () => void;
  /** BEO-576: called after active domain is removed so parent state is cleared. */
  onDomainRemoved?: () => void;
  /** Same gating as TopBar: Pro Builder+ can export; optional so embedders can omit. */
  onExportZip?: () => void;
  isExporting?: boolean;
  /** BEO-656: BYO hosting handler for Pro Builder+; omit to show "Coming soon". */
  onByoHosting?: () => void;
}

const PAID_PLANS = new Set(["pro_starter", "pro_builder", "business"]);
const MAX_CUSTOM_DOMAINS = 3;
/** Must match TopBar export gating */
const EXPORT_GATED_PLANS = new Set(["free", "pro_starter"]);

type ModalView = "choose" | "vercel-deploying" | "vercel-success";

export function PublishModal({
  projectId,
  beomzAppUrl,
  plan = "free",
  customDomain,
  domainStatus,
  onClose,
  onVercelDeployed,
  onVercelUnpublished,
  onDomainRemoved,
  onExportZip,
  isExporting = false,
  onByoHosting,
}: PublishModalProps) {
  const [view, setView] = useState<ModalView>("choose");
  const [copiedVercel, setCopiedVercel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vercelUrl, setVercelUrl] = useState<string | null>(beomzAppUrl ?? null);
  const [vercelElapsed, setVercelElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling + timer on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const [redeploying, setRedeploying] = useState(false);
  const [vercelUnpublishing, setVercelUnpublishing] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startVercelDeploy = useCallback(async (isRedeploy: boolean) => {
    setView("vercel-deploying");
    setError(null);
    setVercelElapsed(0);
    if (isRedeploy) setRedeploying(true);

    const fallbackView: ModalView = isRedeploy ? "vercel-success" : "choose";

    // Step 1: kick off deploy (returns 202 quickly)
    try {
      await deployToVercel(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed — please try again");
      setView(fallbackView);
      setRedeploying(false);
      return;
    }

    // Step 2: start elapsed timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setVercelElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Step 3: poll status every 3s, max 120s
    pollRef.current = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed > 120) {
        stopPolling();
        setError("Deploy timed out — please try again");
        setView(fallbackView);
        setRedeploying(false);
        return;
      }
      try {
        const status = await getVercelDeployStatus(projectId);
        if (status.status === "ready" && status.url) {
          stopPolling();
          setVercelUrl(status.url);
          onVercelDeployed(status.url);
          setView("vercel-success");
          setRedeploying(false);
        } else if (status.status === "error") {
          stopPolling();
          setError("Deploy failed — please try again");
          setView(fallbackView);
          setRedeploying(false);
        }
      } catch {
        // Transient network error — keep polling
      }
    }, 3000);
  }, [projectId, onVercelDeployed, stopPolling]);

  const handleVercelDeploy = useCallback(() => {
    void startVercelDeploy(false);
  }, [startVercelDeploy]);

  const handleVercelRedeploy = useCallback(() => {
    void startVercelDeploy(true);
  }, [startVercelDeploy]);

  const handleVercelUnpublish = useCallback(async () => {
    if (!window.confirm("Remove this app from beomz.app?")) return;
    setVercelUnpublishing(true);
    setError(null);
    try {
      await unpublishVercel(projectId);
      setVercelUrl(null);
      onVercelUnpublished?.();
      setView("choose");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unpublish failed");
    } finally {
      setVercelUnpublishing(false);
    }
  }, [projectId, onVercelUnpublished]);

  const handleCopyVercel = useCallback(() => {
    if (!vercelUrl) return;
    const url = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    void navigator.clipboard.writeText(url);
    setCopiedVercel(true);
    setTimeout(() => setCopiedVercel(false), 2000);
  }, [vercelUrl]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const vercelDisplayUrl = vercelUrl
    ? vercelUrl.replace(/^https?:\/\//, "")
    : null;

  /** beomz.app (Vercel) — custom domain applies once deployed. */
  const hasPublishedSurface = Boolean(beomzAppUrl) || Boolean(vercelUrl);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[520px] rounded-xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
        >
          <X size={16} />
        </button>

        {/* ── CHOOSE VIEW: beomz.app + custom domain + export ── */}
        {view === "choose" && (
          <>
            <h2 className="mb-1 text-lg font-semibold text-[#1a1a1a]">Publish your app</h2>
            <p className="mb-5 text-sm text-[#6b7280]">Deploy to Beomz hosting or export your project.</p>

            <div className="flex flex-col gap-3">
              <button
                onClick={beomzAppUrl ? () => { setView("vercel-success"); } : handleVercelDeploy}
                className="group flex items-start gap-4 rounded-xl border border-[#222] bg-[#111] p-4 text-left transition-all hover:border-[#444] hover:shadow-md"
              >
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/10">
                  <span className="text-lg font-bold text-white">▲</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Deploy to beomz.app</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                      Fast · CDN · No loading
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/50">
                    Instant load. No waiting. Powered by Vercel.
                  </p>
                </div>
                {beomzAppUrl && (
                  <span className="flex-none rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    Live
                  </span>
                )}
              </button>

              {/* BEO-656: Export ZIP card */}
              <ExportZipCard
                plan={plan}
                onExportZip={onExportZip}
                isExporting={isExporting}
                onCloseModal={onClose}
              />

              {/* BEO-656: BYO Hosting card */}
              <ByoHostingCard
                plan={plan}
                onByoHosting={onByoHosting}
                onCloseModal={onClose}
              />
            </div>

            {hasPublishedSurface && (
              <CustomDomainsSection
                projectId={projectId}
                plan={plan}
                customDomain={customDomain ?? null}
                domainStatus={domainStatus ?? null}
                onCloseModal={onClose}
                onDomainRemoved={onDomainRemoved}
              />
            )}

            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          </>
        )}

        {/* ── VERCEL DEPLOYING ── */}
        {view === "vercel-deploying" && (
          <div className="flex flex-col items-center py-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#111]">
              <span className="text-2xl font-bold text-white">▲</span>
            </div>
            <div className="mb-2 flex items-center gap-2">
              <Loader size={16} className="animate-spin text-[#6b7280]" />
              <p className="text-sm font-semibold text-[#1a1a1a]">
                {vercelElapsed < 12 ? "Uploading files..." : "Building on Vercel CDN..."}
              </p>
            </div>
            <p className="text-xs text-[#9ca3af]">
              {vercelElapsed}s elapsed
            </p>
            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          </div>
        )}

        {/* ── VERCEL SUCCESS ── */}
        {view === "vercel-success" && vercelDisplayUrl && (
          <>
            <button
              onClick={() => setView("choose")}
              className="mb-3 flex items-center gap-1 text-xs text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
            >
              <span>&#8592;</span> Back
            </button>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111]">
                <span className="text-sm font-bold text-white">▲</span>
              </div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Live on beomz.app</h2>
            </div>
            <p className="mb-5 text-sm text-[#6b7280]">
              Your app is deployed to Vercel's global CDN — instant load, zero wait.
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-[#222] bg-[#111] px-3 py-2.5">
              <span className="flex-none text-xs font-bold text-white">▲</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                {vercelDisplayUrl}
              </span>
              <button
                onClick={handleCopyVercel}
                className="flex-none rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                {copiedVercel ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
            {copiedVercel && <p className="mt-1 text-xs text-emerald-600">Copied!</p>}

            <div className="mt-4">
              <button
                onClick={handleVercelRedeploy}
                disabled={redeploying}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f3f4f6] disabled:opacity-50"
              >
                {redeploying ? (
                  <><Loader size={14} className="animate-spin" /> Updating...</>
                ) : (
                  <><RefreshCw size={14} /> Update live app</>
                )}
              </button>
              <p className="mt-1 text-center text-[11px] text-[#9ca3af]">Redeploy with your latest changes</p>
            </div>

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  const url = vercelUrl?.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
                  window.open(url, "_blank");
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#111] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#222]"
              >
                <ExternalLink size={14} /> Open
              </button>
              <button
                onClick={onClose}
                className="flex flex-1 items-center justify-center rounded-lg border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f3f4f6]"
              >
                Done
              </button>
            </div>

            <div className="mt-4 border-t border-[#e5e5e5] pt-3">
              <button
                onClick={handleVercelUnpublish}
                disabled={vercelUnpublishing}
                className="flex items-center gap-1.5 text-xs text-[#9ca3af] transition-colors hover:text-red-500 disabled:opacity-50"
              >
                {vercelUnpublishing ? <Loader size={12} className="animate-spin" /> : <Link2Off size={12} />}
                {vercelUnpublishing ? "Removing..." : "Remove from beomz.app"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BEO-656 — Export ZIP card (locked for free/starter, full card for Pro Builder+)
// ─────────────────────────────────────────────────────────────
function ExportZipCard({
  plan,
  onExportZip,
  isExporting,
  onCloseModal,
}: {
  plan: string;
  onExportZip?: () => void;
  isExporting: boolean;
  onCloseModal: () => void;
}) {
  const { openPricingModal } = usePricingModal();
  const isLocked = EXPORT_GATED_PLANS.has(plan);

  if (isLocked) {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-[#222] bg-[#111] p-4">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/10">
          <Download size={18} className="text-white/50" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Export ZIP</span>
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
              <Lock size={8} /> Pro Builder+
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/50">
            Download your project to host anywhere
          </p>
          <button
            onClick={() => { onCloseModal(); openPricingModal(); }}
            className="mt-3 text-xs font-semibold text-[#F97316] hover:underline"
          >
            Upgrade to unlock →
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onExportZip}
      disabled={isExporting || !onExportZip}
      className="group flex items-start gap-4 rounded-xl border border-[#222] bg-[#111] p-4 text-left transition-all hover:border-[#444] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/10">
        {isExporting ? (
          <Loader size={18} className="animate-spin text-white/60" />
        ) : (
          <Download size={18} className="text-white/60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-white">Export ZIP</span>
        <p className="mt-0.5 text-xs text-white/50">
          {isExporting ? "Preparing your ZIP…" : "Download your project to host anywhere"}
        </p>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// BEO-656 — BYO Hosting card (locked for free/starter, full card for Pro Builder+)
// ─────────────────────────────────────────────────────────────
function ByoHostingCard({
  plan,
  onByoHosting,
  onCloseModal,
}: {
  plan: string;
  onByoHosting?: () => void;
  onCloseModal: () => void;
}) {
  const { openPricingModal } = usePricingModal();
  const isLocked = EXPORT_GATED_PLANS.has(plan);

  if (isLocked) {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-[#222] bg-[#111] p-4">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/10">
          <Globe size={18} className="text-white/50" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">BYO Hosting</span>
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
              <Lock size={8} /> Pro Builder+
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/50">
            Deploy to Vercel, Netlify, or any provider
          </p>
          <button
            onClick={() => { onCloseModal(); openPricingModal(); }}
            className="mt-3 text-xs font-semibold text-[#F97316] hover:underline"
          >
            Upgrade to unlock →
          </button>
        </div>
      </div>
    );
  }

  if (!onByoHosting) {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-[#222] bg-[#111] p-4 opacity-60">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/10">
          <Globe size={18} className="text-white/60" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">BYO Hosting</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
              Coming soon
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/50">
            Deploy to Vercel, Netlify, or any provider
          </p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onByoHosting}
      className="group flex items-start gap-4 rounded-xl border border-[#222] bg-[#111] p-4 text-left transition-all hover:border-[#444] hover:shadow-md"
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/10">
        <Globe size={18} className="text-white/60" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-white">BYO Hosting</span>
        <p className="mt-0.5 text-xs text-white/50">
          Deploy to Vercel, Netlify, or any provider
        </p>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// BEO-556 — Custom domain section
// BEO-576 — Active domain persisted to DB; "Live" view when domain_status=active
// ─────────────────────────────────────────────────────────────

interface CustomDomainsSectionProps {
  projectId: string;
  plan: string;
  /** BEO-576: active custom domain name from DB project record, or null. */
  customDomain: string | null;
  /** BEO-576: 'active' when domain is confirmed live, null otherwise. */
  domainStatus: string | null;
  onCloseModal: () => void;
  /** BEO-576: called after active domain is successfully removed. */
  onDomainRemoved?: () => void;
}

function sanitizeDomainInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function CustomDomainsSection({ projectId, plan, customDomain, domainStatus, onCloseModal, onDomainRemoved }: CustomDomainsSectionProps) {
  const { openPricingModal } = usePricingModal();
  const isPaid = PAID_PLANS.has(plan);

  // BEO-576: If domain_status === 'active', show the Live view directly from
  // DB state — no Vercel API call needed on modal open.
  const isActiveDomain = domainStatus === "active" && Boolean(customDomain);

  const [removingActive, setRemovingActive] = useState(false);
  const [removeActiveError, setRemoveActiveError] = useState<string | null>(null);
  // Local state: after removing, switch to the input view within this session
  const [activeDomainCleared, setActiveDomainCleared] = useState(false);

  const handleRemoveActiveDomain = useCallback(async () => {
    if (!window.confirm(`Remove ${customDomain} from this app?`)) return;
    setRemovingActive(true);
    setRemoveActiveError(null);
    try {
      await deleteActiveDomain(projectId);
      setActiveDomainCleared(true);
      onDomainRemoved?.();
    } catch (err) {
      setRemoveActiveError(err instanceof Error ? err.message : "Failed to remove domain");
    } finally {
      setRemovingActive(false);
    }
  }, [projectId, customDomain, onDomainRemoved]);

  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addInput, setAddInput] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const clearPoll = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Load existing domains only when NOT in the active state
  // (active state reads from DB directly, no Vercel API call needed)
  const shouldLoadDomains = isPaid && (!isActiveDomain || activeDomainCleared);

  useEffect(() => {
    if (!shouldLoadDomains) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listCustomDomains(projectId)
      .then((list) => {
        if (!cancelled) setDomains(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load domains");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, shouldLoadDomains]);

  // Auto-poll every 30s (max 10 minutes) whenever any domain is pending.
  useEffect(() => {
    if (!shouldLoadDomains) return;
    const hasPending = domains.some((d) => d.status === "pending");
    if (!hasPending) {
      clearPoll();
      return;
    }
    if (pollIntervalRef.current) return; // already polling
    pollDeadlineRef.current = Date.now() + 10 * 60 * 1000;
    pollIntervalRef.current = setInterval(async () => {
      if (Date.now() > pollDeadlineRef.current) {
        clearPoll();
        return;
      }
      try {
        const fresh = await listCustomDomains(projectId);
        setDomains(fresh);
      } catch {
        // transient — keep polling
      }
    }, 30_000);
  }, [projectId, domains, shouldLoadDomains, clearPoll]);

  // Cleanup on unmount
  useEffect(() => () => clearPoll(), [clearPoll]);

  useEffect(() => {
    if (!removingDomain) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRemovingDomain(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [removingDomain]);

  const handleAdd = useCallback(async () => {
    const cleaned = sanitizeDomainInput(addInput);
    if (!cleaned) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await addCustomDomain(projectId, cleaned);
      setDomains((prev) => {
        const withoutDup = prev.filter((d) => d.domain !== created.domain);
        return [...withoutDup, created];
      });
      setAddInput("");
      setShowAddInput(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAdding(false);
    }
  }, [projectId, addInput]);

  const handleVerify = useCallback(
    async (domain: string) => {
      setVerifying(domain);
      try {
        const updated = await verifyCustomDomain(projectId, domain);
        setDomains((prev) => prev.map((d) => (d.domain === domain ? updated : d)));
      } catch {
        // Fall back to a full list refresh so the UI still updates.
        try {
          const fresh = await listCustomDomains(projectId);
          setDomains(fresh);
        } catch {
          // ignore
        }
      } finally {
        setVerifying(null);
      }
    },
    [projectId],
  );

  const handleRemove = useCallback(
    async (domain: string) => {
      setRemoving(domain);
      try {
        await removeCustomDomain(projectId, domain);
        setDomains((prev) => prev.filter((d) => d.domain !== domain));
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Failed to remove domain");
      } finally {
        setRemoving(null);
      }
    },
    [projectId],
  );

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
    } catch {
      // ignore
    }
  }, []);

  const handleUpgrade = useCallback(() => {
    onCloseModal();
    openPricingModal();
  }, [onCloseModal, openPricingModal]);

  const canAddMore = domains.length < MAX_CUSTOM_DOMAINS;

  return (
    <>
    <div className="mt-5 border-t border-[#e5e5e5] pt-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#1a1a1a]">Custom domain</h3>
          <p className="mt-0.5 text-xs text-[#6b7280]">Connect your own domain to this app</p>
        </div>
        {!isPaid && (
          <span className="flex flex-none items-center gap-1 rounded-full bg-[#F97316]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F97316]">
            <Lock size={10} /> Locked
          </span>
        )}
      </div>

      {!isPaid ? (
        <div className="mt-3 rounded-lg border border-[#e5e5e5] bg-[#faf9f6] p-3">
          <p className="text-xs text-[#6b7280]">
            Available on Starter and above.{" "}
            <button
              onClick={handleUpgrade}
              className="font-semibold text-[#F97316] hover:underline"
            >
              Upgrade →
            </button>
          </p>
        </div>
      ) : isActiveDomain && !activeDomainCleared ? (
        /* ── BEO-576: Active domain — DB-sourced, no Vercel API call needed ── */
        <div className="mt-3 rounded-lg border border-[#e5e5e5] bg-white p-3">
          <div className="flex items-center gap-2">
            <Globe size={14} className="flex-none text-emerald-500" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1a1a1a]">
              {customDomain}
            </span>
            <span className="flex-none rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Live
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <a
              href={`https://${customDomain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#F97316] hover:underline"
            >
              Visit <ExternalLink size={11} />
            </a>
            <button
              onClick={() => void handleRemoveActiveDomain()}
              disabled={removingActive}
              className="text-[#9ca3af] transition-colors hover:text-red-500 disabled:opacity-50"
            >
              {removingActive ? "Removing…" : "Remove domain"}
            </button>
          </div>
          {removeActiveError && (
            <p className="mt-2 text-xs text-red-500">{removeActiveError}</p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
              <Loader size={12} className="animate-spin" /> Loading domains…
            </div>
          )}
          {loadError && !loading && (
            <p className="text-xs text-red-500">{loadError}</p>
          )}

          {/* Existing domains */}
          {!loading &&
            domains.map((d) => (
              <DomainRow
                key={d.domain}
                domain={d}
                verifying={verifying === d.domain}
                removing={removing === d.domain}
                copied={copied}
                onCopy={handleCopy}
                onVerify={() => handleVerify(d.domain)}
                onRemove={() => setRemovingDomain(d.domain)}
              />
            ))}

          {/* Add form / add-another trigger */}
          {!loading && canAddMore && (
            domains.length === 0 || showAddInput ? (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    value={addInput}
                    onChange={(e) => setAddInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAdd();
                      }
                    }}
                    placeholder="yourdomain.com"
                    className="min-w-0 flex-1 rounded-lg border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2 text-sm text-[#1a1a1a] outline-none placeholder:text-[#d1d5db] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20"
                  />
                  <button
                    onClick={() => void handleAdd()}
                    disabled={adding || sanitizeDomainInput(addInput).length === 0}
                    className="flex flex-none items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {adding ? <Loader size={12} className="animate-spin" /> : null}
                    Add
                  </button>
                  {domains.length > 0 && (
                    <button
                      onClick={() => {
                        setShowAddInput(false);
                        setAddInput("");
                        setAddError(null);
                      }}
                      className="flex-none rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-xs font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6]"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {addError && <p className="text-xs text-red-500">{addError}</p>}
              </div>
            ) : (
              <button
                onClick={() => setShowAddInput(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-[#F97316] transition-colors hover:text-[#ea6c0e]"
              >
                <Plus size={12} /> Add another domain
              </button>
            )
          )}
        </div>
      )}
    </div>

    {removingDomain && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setRemovingDomain(null)}
          role="presentation"
        />
        <div
          className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-domain-title"
        >
          <h3
            id="remove-domain-title"
            className="text-base font-semibold text-[#1a1a1a]"
          >
            Remove domain
          </h3>
          <p className="mt-2 text-sm text-[#6b7280]">
            Are you sure you want to remove{" "}
            <strong className="font-semibold text-[#1a1a1a]">{removingDomain}</strong> from
            this app? This cannot be undone.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setRemovingDomain(null)}
              className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[#f3f4f6]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!removingDomain) return;
                const d = removingDomain;
                setRemovingDomain(null);
                void handleRemove(d);
              }}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600"
            >
              Remove domain
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

interface DomainRowProps {
  domain: CustomDomain;
  verifying: boolean;
  removing: boolean;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  onVerify: () => void;
  onRemove: () => void;
}

/**
 * BEO-563 — Three domain states:
 *   pending-verification  verified=false, TXT record needed
 *   dns-setup             verified=true by Vercel but traffic not yet routed
 *   active                verified=true (Vercel confirmation is source of truth)
 *
 * BEO-576: Removed the client-side checkDomainReachable HEAD request — it
 * always failed due to CORS restrictions. Vercel's verified=true is now the
 * sole criterion for the "active" state. domain_status='active' is persisted
 * to the DB so the Live badge survives page refresh (handled in CustomDomainsSection).
 */
function DomainRow({
  domain,
  verifying,
  removing,
  copied,
  onCopy,
  onVerify,
  onRemove,
}: DomainRowProps) {
  const isVerifiedByVercel = domain.status === "verified" || domain.verified === true;
  const showTxtCard = Boolean(!isVerifiedByVercel && domain.verification?.length);
  const txt = domain.verification?.[0];

  // Treat verified=true as active — the client-side reachability check was
  // CORS-blocked and unreliable. Vercel's verification is the source of truth.
  const displayState: "pending-verification" | "active" =
    !isVerifiedByVercel ? "pending-verification" : "active";

  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-3">
      {/* ── Header row ── */}
      <div className="flex items-center gap-2">
        <Globe
          size={14}
          className={`flex-none ${displayState === "active" ? "text-emerald-500" : "text-[#9ca3af]"}`}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1a1a1a]">
          {domain.domain}
        </span>
        {displayState === "active" && (
          <span className="flex-none rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Live
          </span>
        )}
        {displayState === "pending-verification" && (
          <span className="flex-none rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
            Pending verification
          </span>
        )}
      </div>

      {/* ── State: Active ── */}
      {displayState === "active" && (
        <div className="mt-3 flex items-center gap-3 text-xs">
          <a
            href={`https://${domain.domain}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[#F97316] hover:underline"
          >
            Visit <ExternalLink size={11} />
          </a>
          <button
            onClick={onRemove}
            disabled={removing}
            className="text-[#9ca3af] transition-colors hover:text-red-500 disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      )}

      {/* ── State: Pending TXT verification ── */}
      {displayState === "pending-verification" && (
        <>
          {showTxtCard && txt && (
            <div className="mt-3 rounded-lg border border-[#f0e6d6] bg-[#fef7ea] p-3">
              <p className="mb-2 text-xs font-medium text-[#92400e]">
                Add this TXT record to your DNS:
              </p>
              <dl className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <dt className="w-14 flex-none font-medium text-[#6b7280]">Type</dt>
                  <dd className="font-mono text-[#1a1a1a]">TXT</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-14 flex-none font-medium text-[#6b7280]">Name</dt>
                  <dd className="min-w-0 flex-1 break-all font-mono text-[#1a1a1a]">{txt.domain}</dd>
                  <CopyBtn
                    text={txt.domain}
                    k={`${domain.domain}:name`}
                    copied={copied}
                    onCopy={onCopy}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-14 flex-none font-medium text-[#6b7280]">Value</dt>
                  <dd className="min-w-0 flex-1 break-all font-mono text-[#1a1a1a]">{txt.value}</dd>
                  <CopyBtn
                    text={txt.value}
                    k={`${domain.domain}:value`}
                    copied={copied}
                    onCopy={onCopy}
                  />
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-[#92400e]/70">
                DNS changes can take up to 24 hours to propagate.
              </p>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs">
            <button
              onClick={onVerify}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 font-medium text-[#1a1a1a] transition-colors hover:bg-[#f3f4f6] disabled:opacity-50"
            >
              {verifying ? (
                <><Loader size={11} className="animate-spin" /> Checking…</>
              ) : (
                <><RefreshCw size={11} /> Check verification</>
              )}
            </button>
            <button
              onClick={onRemove}
              disabled={removing}
              className="text-[#9ca3af] transition-colors hover:text-red-500 disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface CopyBtnProps {
  text: string;
  k: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}

function CopyBtn({ text, k, copied, onCopy }: CopyBtnProps) {
  const isCopied = copied === k;
  return (
    <button
      onClick={() => onCopy(text, k)}
      className="flex-none rounded-md p-1 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
      title={isCopied ? "Copied!" : "Copy"}
    >
      {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}
