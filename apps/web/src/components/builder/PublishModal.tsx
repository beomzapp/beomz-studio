/**
 * PublishModal — Publish app to public URL or manage existing publication.
 * Two states: IDLE (slug input + publish CTA) and SUCCESS (live URL + copy/open).
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
import { publishProject, unpublishProject, checkSlugAvailable } from "../../lib/api";

interface PublishModalProps {
  projectId: string;
  projectName: string;
  isPublished: boolean;
  publishedSlug?: string;
  onClose: () => void;
  onPublished: (url: string, slug: string) => void;
  onUnpublished: () => void;
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

export function PublishModal({
  projectId,
  projectName,
  isPublished,
  publishedSlug,
  onClose,
  onPublished,
  onUnpublished,
}: PublishModalProps) {
  const [view, setView] = useState<"idle" | "success">(isPublished ? "success" : "idle");
  const [slug, setSlug] = useState(publishedSlug || slugify(projectName));
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus slug input on mount in idle state
  useEffect(() => {
    if (view === "idle") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [view]);

  // Debounced slug availability check
  useEffect(() => {
    if (view !== "idle") return;

    const cleaned = slugify(slug);
    if (cleaned !== slug) {
      setSlug(cleaned);
      return;
    }

    if (!cleaned || cleaned.length < 2) {
      setSlugAvailable(null);
      return;
    }

    // If this is the already-published slug, it's ours
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
      setView("success");
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
      setView("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unpublish failed");
    } finally {
      setUnpublishing(false);
    }
  }, [projectId, onUnpublished]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [slug]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const publicUrl = `https://${slug}.beomz.ai`;
  const isSlugValid = slug.length >= 2 && slugAvailable !== false;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-[480px] rounded-xl bg-white p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
        >
          <X size={16} />
        </button>

        {view === "idle" ? (
          <>
            {/* IDLE STATE */}
            <div className="mb-1 flex items-center gap-2">
              <Globe size={18} className="text-[#F97316]" />
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Publish your app</h2>
            </div>
            <p className="mb-5 text-sm text-[#6b7280]">
              Make your app available at a public URL anyone can visit.
            </p>

            {/* Slug input */}
            <label className="mb-1.5 block text-xs font-medium text-[#6b7280]">
              URL slug
            </label>
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
              {checking && <Loader size={14} className="animate-spin text-[#9ca3af]" />}
              {!checking && slugAvailable === true && (
                <Check size={14} className="text-emerald-500" />
              )}
              {!checking && slugAvailable === false && (
                <X size={14} className="text-red-500" />
              )}
            </div>

            {/* Availability feedback */}
            <div className="mt-1.5 h-4">
              {!checking && slugAvailable === true && (
                <p className="text-xs text-emerald-600">Available</p>
              )}
              {!checking && slugAvailable === false && (
                <p className="text-xs text-red-500">Already taken</p>
              )}
            </div>

            {/* Preview URL */}
            {slug.length >= 2 && (
              <p className="mt-2 text-xs text-[#9ca3af]">
                Your app will be live at{" "}
                <span className="font-medium text-[#6b7280]">{publicUrl}</span>
              </p>
            )}

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

            {/* Publish CTA */}
            <button
              onClick={handlePublish}
              disabled={publishing || !isSlugValid || checking}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? (
                <>
                  <Loader size={14} className="animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Globe size={14} />
                  Publish
                </>
              )}
            </button>
          </>
        ) : (
          <>
            {/* SUCCESS STATE */}
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                <Check size={16} className="text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Your app is live</h2>
            </div>
            <p className="mb-5 text-sm text-[#6b7280]">
              Anyone with the link can use your app.
            </p>

            {/* URL display */}
            <div className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2.5">
              <Globe size={14} className="flex-none text-emerald-500" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1a1a1a]">
                {publicUrl}
              </span>
              <button
                onClick={handleCopy}
                className="flex-none rounded-md p-1 text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a1a]"
                title="Copy URL"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            {copied && (
              <p className="mt-1 text-xs text-emerald-600">Copied!</p>
            )}

            {/* Action buttons */}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => window.open(publicUrl, "_blank")}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e]"
              >
                <ExternalLink size={14} />
                Open
              </button>
              <button
                onClick={onClose}
                className="flex flex-1 items-center justify-center rounded-lg border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f3f4f6]"
              >
                Done
              </button>
            </div>

            {/* Divider + Unpublish */}
            <div className="mt-5 border-t border-[#e5e5e5] pt-4">
              {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
              <button
                onClick={handleUnpublish}
                disabled={unpublishing}
                className="flex items-center gap-1.5 text-xs text-[#9ca3af] transition-colors hover:text-red-500 disabled:opacity-50"
              >
                {unpublishing ? (
                  <Loader size={12} className="animate-spin" />
                ) : (
                  <Link2Off size={12} />
                )}
                {unpublishing ? "Unpublishing..." : "Unpublish this app"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
