/**
 * PublishModal — Two publish options: Beomz (WebContainer) and beomz.app (Vercel CDN).
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
} from "lucide-react";
import {
  publishProject,
  unpublishProject,
  checkSlugAvailable,
  deployToVercel,
} from "../../lib/api";

interface PublishModalProps {
  projectId: string;
  projectName: string;
  isPublished: boolean;
  publishedSlug?: string;
  beomzAppUrl?: string | null;
  onClose: () => void;
  onPublished: (url: string, slug: string) => void;
  onUnpublished: () => void;
  onVercelDeployed: (url: string) => void;
}

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
  onClose,
  onPublished,
  onUnpublished,
  onVercelDeployed,
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleVercelDeploy = useCallback(async () => {
    setView("vercel-deploying");
    setError(null);
    try {
      const result = await deployToVercel(projectId);
      setVercelUrl(result.url);
      onVercelDeployed(result.url);
      setView("vercel-success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      setView("choose");
    }
  }, [projectId, onVercelDeployed]);

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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[520px] rounded-xl bg-white p-6 shadow-xl">
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
              <p className="text-sm font-semibold text-[#1a1a1a]">Deploying to beomz.app...</p>
            </div>
            <p className="text-xs text-[#9ca3af]">Building your app on Vercel's CDN...</p>
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
          </>
        )}
      </div>
    </div>
  );
}
