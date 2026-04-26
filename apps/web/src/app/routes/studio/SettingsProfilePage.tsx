/**
 * SettingsProfilePage — BEO-276
 * Profile settings at /studio/settings/profile.
 * Loads real profile from GET /api/me, saves via PATCH /api/me.
 * Shows read-only email + created date, plan badge, credits balance, delete account.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { User, Mail, Calendar, Zap, Upload, X, AlertTriangle, CheckCircle } from "lucide-react";
import { getApiBaseUrl, getMe, patchMe, uploadUserAvatar } from "../../../lib/api";
import type { UserProfile } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import { usePricingModal } from "../../../contexts/PricingModalContext";

// Google avatar URLs need to be proxied through the API to avoid COEP blocking.
function proxiedAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes("googleusercontent.com")) {
    return `${getApiBaseUrl()}/avatar?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const BUILDING_FOR_OPTIONS = [
  { value: "SaaS", label: "SaaS product" },
  { value: "Agency", label: "Agency / client work" },
  { value: "Personal", label: "Personal project" },
  { value: "Side project", label: "Side project" },
  { value: "Other", label: "Other" },
];

const REFERRAL_OPTIONS = [
  { value: "Twitter/X", label: "Twitter / X" },
  { value: "ProductHunt", label: "ProductHunt" },
  { value: "Friend", label: "Friend / word of mouth" },
  { value: "Google", label: "Google search" },
  { value: "Other", label: "Other" },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro_starter: "Pro Starter",
  pro_builder: "Pro Builder",
  business: "Business",
};

export function SettingsProfilePage() {
  const { openPricingModal } = usePricingModal();
  const { session } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Pull Google OAuth metadata so empty profile fields fall back to whatever
  // the user signed up with rather than showing blanks.
  const googleProfile = useMemo(() => {
    const meta = (session?.user?.user_metadata ?? null) as Record<string, unknown> | null;
    const name = typeof meta?.full_name === "string" && meta.full_name.trim().length > 0
      ? meta.full_name.trim()
      : typeof meta?.name === "string" && meta.name.trim().length > 0
        ? meta.name.trim()
        : null;
    const avatar = typeof meta?.avatar_url === "string" && meta.avatar_url.trim().length > 0
      ? meta.avatar_url.trim()
      : typeof meta?.picture === "string" && meta.picture.trim().length > 0
        ? meta.picture.trim()
        : null;
    return { name, avatar };
  }, [session]);

  // Form state
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [buildingFor, setBuildingFor] = useState("");
  const [referralSource, setReferralSource] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ fullName?: string; displayName?: string }>({});

  // Delete account dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMe()
      .then((data) => {
        setProfile(data);
        setFullName(data.full_name ?? googleProfile.name ?? "");
        setDisplayName(data.display_name ?? "");
        setBuildingFor(data.building_for ?? "");
        setReferralSource(data.referral_source ?? "");
        const avatar = data.avatar_url ?? googleProfile.avatar ?? null;
        if (avatar) setAvatarPreview(proxiedAvatarUrl(avatar));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
    // googleProfile is read-only fallback; safe to omit so we don't refetch
    // /me when the session resolves a hair after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backfill from Google when the session resolves after the initial /me load
  // (race: useAuth() can return null on first render).
  useEffect(() => {
    if (!profile) return;
    if (fullName === "" && googleProfile.name) {
      setFullName(googleProfile.name);
    }
    if (avatarPreview === null && !avatarFile && googleProfile.avatar) {
      setAvatarPreview(proxiedAvatarUrl(googleProfile.avatar));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleProfile.name, googleProfile.avatar, profile]);

  const getInitials = () => {
    const name = fullName.trim() || profile?.full_name?.trim() || (profile?.email ?? "");
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? "")
      .join("") || "U";
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const validate = () => {
    const errs: typeof errors = {};
    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!displayName.trim()) {
      errs.displayName = "Display name is required";
    } else if (!/^[A-Za-z0-9-]{3,30}$/.test(displayName.trim())) {
      errs.displayName = "3–30 characters, letters, numbers, and hyphens only";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      let avatar_url: string | undefined;
      if (avatarFile) {
        const result = await uploadUserAvatar(avatarFile).catch(() => null);
        if (result) avatar_url = result.avatar_url;
      }
      const updated = await patchMe({
        full_name: fullName.trim(),
        display_name: displayName.trim(),
        ...(avatar_url ? { avatar_url } : {}),
        ...(buildingFor ? { building_for: buildingFor } : {}),
        ...(referralSource ? { referral_source: referralSource } : {}),
      });
      setProfile(updated);
      setAvatarFile(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const planLabel = PLAN_LABELS[profile?.plan ?? "free"] ?? profile?.plan ?? "Free";
  const isFree = (profile?.plan ?? "free") === "free";

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#faf9f6]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]" style={{ fontFamily: "DM Sans, sans-serif" }}>
            Profile
          </h1>
          <p className="mt-1 text-sm text-[#6b7280]">Manage your public profile and preferences.</p>
        </div>

        {/* Account info — read-only */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-5 flex items-center gap-2 text-[#1a1a1a]">
            <User size={18} />
            <h2 className="text-base font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>Account</h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-[#f0eeeb] bg-[#faf9f6] px-4 py-2.5">
              <Mail size={14} className="flex-none text-[#9ca3af]" />
              <div>
                <p className="text-[11px] text-[#9ca3af]">Email</p>
                <p className="text-sm text-[#374151]">{profile?.email ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-[#f0eeeb] bg-[#faf9f6] px-4 py-2.5">
              <Calendar size={14} className="flex-none text-[#9ca3af]" />
              <div>
                <p className="text-[11px] text-[#9ca3af]">Member since</p>
                <p className="text-sm text-[#374151]">{memberSince}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-[#f0eeeb] bg-[#faf9f6] px-4 py-2.5">
              <Zap size={14} className="flex-none text-[#9ca3af]" />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <p className="text-[11px] text-[#9ca3af]">Plan</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-[#374151]">{planLabel}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isFree ? "bg-[#fff7ed] text-[#F97316]" : "bg-[#f0fdf4] text-[#16a34a]"
                      }`}
                    >
                      {planLabel}
                    </span>
                  </div>
                </div>
                {isFree && (
                  <button
                    type="button"
                    onClick={openPricingModal}
                    className="text-xs font-medium text-[#F97316] underline-offset-2 hover:underline"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-[#f0eeeb] bg-[#faf9f6] px-4 py-2.5">
              <Zap size={14} className="flex-none text-[#9ca3af]" />
              <div className="flex flex-1 items-center justify-between">
                <div>
                  <p className="text-[11px] text-[#9ca3af]">Credits balance</p>
                  <p className="text-sm font-semibold text-[#F97316]">{profile?.credits ?? 0} credits</p>
                </div>
                <button
                  type="button"
                  onClick={openPricingModal}
                  className="text-xs font-medium text-[#6b7280] underline-offset-2 hover:underline"
                >
                  Buy more →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Editable profile */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-5 flex items-center gap-2 text-[#1a1a1a]">
            <User size={18} />
            <h2 className="text-base font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>Edit profile</h2>
          </div>

          {/* Avatar */}
          <div className="mb-5 flex items-center gap-4">
            <div className="relative">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-[#F97316]/20"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F97316] text-lg font-bold text-white">
                  {getInitials()}
                </div>
              )}
              {avatarPreview && (
                <button
                  type="button"
                  onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#e5e5e5]"
                >
                  <X size={10} className="text-[#6b7280]" />
                </button>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#f3f4f6]"
              >
                <Upload size={12} />
                {avatarPreview ? "Change photo" : "Upload photo"}
              </button>
              <p className="mt-1 text-[11px] text-[#9ca3af]">Optional. PNG, JPEG, WebP up to 5MB.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Full name */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[#374151]">
              Full name <span className="text-[#F97316]">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-[#1a1a1a] outline-none transition-colors placeholder:text-[#9ca3af] focus:ring-1 focus:ring-[#F97316] ${errors.fullName ? "border-red-400 bg-red-50" : "border-[#e5e5e5] bg-white focus:border-[#F97316]"}`}
            />
            {errors.fullName && (
              <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>
            )}
          </div>

          {/* Display name */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[#374151]">
              Display name <span className="text-[#F97316]">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. omar-builds"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-[#1a1a1a] outline-none transition-colors placeholder:text-[#9ca3af] focus:ring-1 focus:ring-[#F97316] ${errors.displayName ? "border-red-400 bg-red-50" : "border-[#e5e5e5] bg-white focus:border-[#F97316]"}`}
            />
            {errors.displayName ? (
              <p className="mt-1 text-xs text-red-500">{errors.displayName}</p>
            ) : (
              <p className="mt-1 text-[11px] text-[#9ca3af]">3–30 chars, letters, numbers, hyphens</p>
            )}
          </div>

          {/* Building for */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[#374151]">
              What are you building?
            </label>
            <select
              value={buildingFor}
              onChange={(e) => setBuildingFor(e.target.value)}
              className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
            >
              <option value="">Select…</option>
              {BUILDING_FOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Referral source */}
          <div className="mb-6">
            <label className="mb-1 block text-xs font-medium text-[#374151]">
              How did you hear about us?
            </label>
            <select
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
            >
              <option value="">Select…</option>
              {REFERRAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Save feedback */}
          {saveError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <AlertTriangle size={14} className="flex-none text-red-500" />
              <p className="text-xs text-red-600">{saveError}</p>
            </div>
          )}
          {saveSuccess && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <CheckCircle size={14} className="flex-none text-green-500" />
              <p className="text-xs text-green-700">Profile saved successfully.</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save profile"}
          </button>
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl border border-red-100 bg-white p-6">
          <div className="mb-3 flex items-center gap-2 text-red-500">
            <AlertTriangle size={18} />
            <h2 className="text-base font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>Danger zone</h2>
          </div>
          <p className="mb-4 text-sm text-[#6b7280]">
            Permanently delete your account and all associated data.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
          >
            Delete account
          </button>
        </section>
      </div>

      {/* Delete account dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <h3 className="text-base font-bold text-[#1a1a1a]">Delete account</h3>
            <p className="mt-2 text-sm text-[#6b7280]">
              To delete your account, please contact our support team at{" "}
              <a
                href="mailto:support@beomz.com?subject=Delete%20my%20account"
                className="font-medium text-[#F97316] underline-offset-2 hover:underline"
              >
                support@beomz.com
              </a>
              . We&rsquo;ll process your request within 48 hours.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="rounded-lg border border-[#e5e5e5] px-4 py-2 text-sm font-medium text-[#374151] transition-colors hover:bg-[#f3f4f6]"
              >
                Close
              </button>
              <a
                href="mailto:support@beomz.com?subject=Delete%20my%20account"
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Contact support
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
