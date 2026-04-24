/**
 * PublishModal — Two publish options: Beomz (WebContainer) and beomz.app (Vercel CDN).
 *
 * BEO-556: Custom-domain UI (Starter+ gated) lets users connect their own
 * domain(s) to the published app. Adds a verification card with the TXT
 * record from Vercel, a manual "Check verification" button, 30s background
 * polling (up to 10 min), plus Visit/Remove once verified.
 *
 * BEO-559: Custom domain appears on the main "choose" view (below the two
 * publish options) when the project already has a Beomz slug or beomz.app URL
 * — not only after the Vercel success screen.
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
} from "lucide-react";
import {
  publishProject,
  unpublishProject,
  checkSlugAvailable,
  deployToVercel,
  getVercelDeployStatus,
  unpublishVercel,
  listCustomDomains,
  addCustomDomain,
  verifyCustomDomain,
  removeCustomDomain,
  type CustomDomain,
} from "../../lib/api";
import { usePricingModal } from "../../contexts/PricingModalContext";

interface PublishModalProps {
  projectId: string;
  projectName: string;
  isPublished: boolean;
  publishedSlug?: string;
  beomzAppUrl?: string | null;
  /** BEO-556: user's plan — gates custom-domain UI. "free" shows locked state. */
  plan?: string;
  onClose: () => void;
  onPublished: (url: string, slug: string) => void;
  onUnpublished: () => void;
  onVercelDeployed: (url: string) => void;
  onVercelUnpublished?: () => void;
}

const PAID_PLANS = new Set(["pro_starter", "pro_builder", "business"]);
const MAX_CUSTOM_DOMAINS = 3;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

type ModalView = "choose" | "beomz-idle" | "beomz-success" | "vercel-deploying" | "vercel-success";

export function PublishModal({
  projectId,
  projectName,
  isPublished,
  publishedSlug,
  beomzAppUrl,
  plan = "free",
  onClose,
  onPublished,
  onUnpublished,
  onVercelDeployed,
  onVercelUnpublished,
}: PublishModalProps) {
  // Determine initial view
  const initialView = (): ModalView => {
    if (isPublished) return "beomz-success";
    return "choose";
  };

  const [view, setView] = useState<ModalView>(initialView);
  const [slug, setSlug] = useState(publishedSlug || slugify(projectName));
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedVercel, setCopiedVercel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vercelUrl, setVercelUrl] = useState<string | null>(beomzAppUrl ?? null);
  const [vercelElapsed, setVercelElapsed] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Focus slug input when entering beomz-idle
  useEffect(() => {
    if (view === "beomz-idle") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [view]);

  // Debounced slug availability check
  useEffect(() => {
    if (view !== "beomz-idle") return;

    const cleaned = slugify(slug);
    if (cleaned !== slug) {
      setSlug(cleaned);
      return;
    }

    if (!cleaned || cleaned.length < 2) {
      setSlugAvailable(null);
      return;
    }

    if (isPublished && cleaned === publishedSlug) {
      setSlugAvailable(true);
      return;
    }

    setChecking(true);
    setSlugAvailable(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { available } = await checkSlugAvailable(cleaned);
        setSlugAvailable(available);
      } catch {
        setSlugAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug, view, isPublished, publishedSlug]);

  const handlePublish = useCallback(async () => {
    if (!slug || slugAvailable === false) return;
    setPublishing(true);
    setError(null);
    try {
      const result = await publishProject(projectId, slug);
      onPublished(result.url, slug);
      setView("beomz-success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }, [projectId, slug, slugAvailable, onPublished]);

  const handleUnpublish = useCallback(async () => {
    setUnpublishing(true);
    setError(null);
    try {
      await unpublishProject(projectId);
      onUnpublished();
      setView("choose");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unpublish failed");
    } finally {
      setUnpublishing(false);
    }
  }, [projectId, onUnpublished]);

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

  const handleCopyBeomz = useCallback(() => {
    void navigator.clipboard.writeText(`https://${slug}.beomz.ai`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [slug]);

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

  const beomzUrl = `https://${slug}.beomz.ai`;
  const isSlugValid = slug.length >= 2 && slugAvailable !== false;
  const vercelDisplayUrl = vercelUrl
    ? vercelUrl.replace(/^https?:\/\//, "")
    : null;

  /** Published to Beomz (slug) and/or beomz.app (Vercel) — custom domain applies after at least one is live. */
  const hasPublishedSurface =
    Boolean(publishedSlug?.length) || Boolean(beomzAppUrl) || Boolean(vercelUrl);

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

        {/* ── CHOOSE VIEW: Two cards ── */}
        {view === "choose" && (
          <>
            <h2 className="mb-1 text-lg font-semibold text-[#1a1a1a]">Publish your app</h2>
            <p className="mb-5 text-sm text-[#6b7280]">Choose how you want to share your app.</p>

            <div className="flex flex-col gap-3">
              {/* Card A — Beomz */}
              <button
                onClick={() => setView("beomz-idle")}
                className="group flex items-start gap-4 rounded-xl border border-[#e5e5e5] bg-[#faf9f6] p-4 text-left transition-all hover:border-[#F97316]/40 hover:shadow-sm"
              >
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#F97316]/10">
                  <Globe size={20} className="text-[#F97316]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1a1a1a]">Publish on Beomz</span>
                    <span className="rounded-full bg-[#F97316]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F97316]">
                      Free
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#6b7280]">
                    Live at <span className="font-medium">{slug}.beomz.ai</span> — runs in the browser via WebContainer
                  </p>
                </div>
                {isPublished && (
                  <span className="flex-none rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Live
                  </span>
                )}
              </button>

              {/* Card B — Vercel / beomz.app */}
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
            </div>

            {hasPublishedSurface && (
              <CustomDomainsSection projectId={projectId} plan={plan} onCloseModal={onClose} />
            )}

            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          </>
        )}

        {/* ── BEOMZ IDLE: slug input ── */}
        {view === "beomz-idle" && (
          <>
            <button
              onClick={() => setView("choose")}
              className="mb-3 flex items-center gap-1 text-xs text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
            >
              <span>&#8592;</span> Back
            </button>
            <div className="mb-1 flex items-center gap-2">
              <Globe size={18} className="text-[#F97316]" />
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Publish on Beomz</h2>
            </div>
            <p className="mb-5 text-sm text-[#6b7280]">
              Your app will run in the browser — no server needed.
            </p>

            <label className="mb-1.5 block text-xs font-medium text-[#6b7280]">URL slug</label>
            <div className="flex items-center rounded-lg border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2.5 focus-within:border-[#F97316] focus-within:ring-1 focus-within:ring-[#F97316]/20">
              <input
                ref={inputRef}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                maxLength={50}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#1a1a1a] outline-none placeholder:text-[#d1d5db]"
                placeholder="my-app"
              />
              <span className="ml-1 text-sm text-[#9ca3af]">.beomz.ai</span>
              {checking && <Loader size={14} className="ml-2 animate-spin text-[#9ca3af]" />}
              {!checking && slugAvailable === true && (
                <Check size={14} className="ml-2 text-emerald-500" />
              )}
              {!checking && slugAvailable === false && (
                <X size={14} className="ml-2 text-red-500" />
              )}
            </div>

            <div className="mt-1.5 h-4">
              {!checking && slugAvailable === true && (
                <p className="text-xs text-emerald-600">Available</p>
              )}
              {!checking && slugAvailable === false && (
                <p className="text-xs text-red-500">Already taken</p>
              )}
            </div>

            {slug.length >= 2 && (
              <p className="mt-2 text-xs text-[#9ca3af]">
                Your app will be live at{" "}
                <span className="font-medium text-[#6b7280]">{beomzUrl}</span>
              </p>
            )}

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

            <button
              onClick={handlePublish}
              disabled={publishing || !isSlugValid || checking}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? (
                <><Loader size={14} className="animate-spin" /> Publishing...</>
              ) : (
                <><Globe size={14} /> Publish</>
              )}
            </button>
          </>
        )}

        {/* ── BEOMZ SUCCESS ── */}
        {view === "beomz-success" && (
          <>
            <button
              onClick={() => setView("choose")}
              className="mb-3 flex items-center gap-1 text-xs text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
            >
              <span>&#8592;</span> Back
            </button>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                <Check size={16} className="text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Live on Beomz</h2>
            </div>
            <p className="mb-5 text-sm text-[#6b7280]">Anyone with the link can use your app.</p>

            <div className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2.5">
              <Globe size={14} className="flex-none text-emerald-500" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1a1a1a]">
                {beomzUrl}
              </span>
              <button
                onClick={handleCopyBeomz}
                className="flex-none rounded-md p-1 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            {copied && <p className="mt-1 text-xs text-emerald-600">Copied!</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => window.open(beomzUrl, "_blank")}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e]"
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

            <div className="mt-5 border-t border-[#e5e5e5] pt-4">
              {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
              <button
                onClick={handleUnpublish}
                disabled={unpublishing}
                className="flex items-center gap-1.5 text-xs text-[#9ca3af] transition-colors hover:text-red-500 disabled:opacity-50"
              >
                {unpublishing ? <Loader size={12} className="animate-spin" /> : <Link2Off size={12} />}
                {unpublishing ? "Unpublishing..." : "Unpublish this app"}
              </button>
            </div>
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
// BEO-556 — Custom domain section
// ─────────────────────────────────────────────────────────────

interface CustomDomainsSectionProps {
  projectId: string;
  plan: string;
  onCloseModal: () => void;
}

function sanitizeDomainInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function CustomDomainsSection({ projectId, plan, onCloseModal }: CustomDomainsSectionProps) {
  const { openPricingModal } = usePricingModal();
  const isPaid = PAID_PLANS.has(plan);

  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addInput, setAddInput] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const clearPoll = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Load existing domains on mount (paid plans only)
  useEffect(() => {
    if (!isPaid) return;
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
  }, [projectId, isPaid]);

  // Auto-poll every 30s (max 10 minutes) whenever any domain is pending.
  useEffect(() => {
    if (!isPaid) return;
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
  }, [projectId, domains, isPaid, clearPoll]);

  // Cleanup on unmount
  useEffect(() => () => clearPoll(), [clearPoll]);

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
      if (!window.confirm(`Remove ${domain}?`)) return;
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
                onRemove={() => handleRemove(d.domain)}
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

function DomainRow({
  domain,
  verifying,
  removing,
  copied,
  onCopy,
  onVerify,
  onRemove,
}: DomainRowProps) {
  console.log("[DomainRow] domain:", JSON.stringify(domain));
  const isVerified =
    domain.status === "verified" || domain.verified === true;
  const showVerificationCard = Boolean(
    !domain.verified &&
      domain.verification &&
      domain.verification.length > 0,
  );
  const txt = domain.verification?.[0];

  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-3">
      <div className="flex items-center gap-2">
        <Globe
          size={14}
          className={`flex-none ${isVerified ? "text-emerald-500" : "text-[#9ca3af]"}`}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1a1a1a]">
          {domain.domain}
        </span>
        {isVerified ? (
          <span className="flex-none rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Active
          </span>
        ) : (
          <span className="flex-none rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
            Pending verification
          </span>
        )}
      </div>

      {isVerified ? (
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
      ) : (
        <>
          {showVerificationCard && txt && (
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
                  <dd className="min-w-0 flex-1 break-all font-mono text-[#1a1a1a]">
                    {txt.domain}
                  </dd>
                  <CopyBtn
                    text={txt.domain}
                    k={`${domain.domain}:name`}
                    copied={copied}
                    onCopy={onCopy}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-14 flex-none font-medium text-[#6b7280]">Value</dt>
                  <dd className="min-w-0 flex-1 break-all font-mono text-[#1a1a1a]">
                    {txt.value}
                  </dd>
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
                <>
                  <Loader size={11} className="animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <RefreshCw size={11} /> Check verification
                </>
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
