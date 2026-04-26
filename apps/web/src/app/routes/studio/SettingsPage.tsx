import { useState, useEffect } from "react";
import { User, CreditCard, Wallet, ExternalLink, Lock, Sparkles, Zap } from "lucide-react";
import {
  ALL_PERSONALITIES,
  PERSONALITY_LABELS,
  getPersonality,
  isRandomMode,
  setPersonality,
  setRandomPersonality,
  type PersonalityId,
} from "../../../lib/personalities";
import {
  getMe,
  getCredits,
  getBillingPortalUrl,
  type UserProfile,
  type CreditsResponse,
} from "../../../lib/api";

const PLAN_META: Record<string, { label: string; price: string }> = {
  free: { label: "Free", price: "$0" },
  pro_starter: { label: "Pro Starter", price: "$19/mo" },
  pro_builder: { label: "Pro Builder", price: "$39/mo" },
  business: { label: "Business", price: "$199/mo" },
};

function getPlanMeta(plan: string): { label: string; price: string } {
  return PLAN_META[plan] ?? { label: plan, price: "" };
}

function getInitials(profile: UserProfile): string {
  const name = profile.display_name ?? profile.full_name ?? "";
  if (name.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (profile.email?.[0] ?? "?").toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function SettingsPage() {
  const [selectedId, setSelectedId] = useState<PersonalityId | "random">(() =>
    isRandomMode() ? "random" : getPersonality(),
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    getMe()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
    getCredits()
      .then(setCredits)
      .catch(() => {})
      .finally(() => setLoadingCredits(false));
  }, []);

  const handleSelect = (id: PersonalityId | "random") => {
    setSelectedId(id);
    if (id === "random") {
      setRandomPersonality();
    } else {
      setPersonality(id);
    }
  };

  const handleOpenPortal = async () => {
    setOpeningPortal(true);
    try {
      const { url } = await getBillingPortalUrl();
      window.open(url, "_blank", "noopener");
    } catch {
      // silently ignore
    } finally {
      setOpeningPortal(false);
    }
  };

  const plan = credits?.plan ?? profile?.plan ?? "free";
  const planMeta = getPlanMeta(plan);
  const isFree = plan === "free";
  const balance = credits?.balance ?? 0;

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-2xl font-bold text-[#1a1a1a]">Settings</h1>

        {/* Account */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <User size={18} />
            <h2 className="text-base font-semibold">Account</h2>
          </div>

          {loadingProfile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 animate-pulse rounded-full bg-[#f0eeeb]" />
                <div className="space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-[#f0eeeb]" />
                  <div className="h-3 w-48 animate-pulse rounded bg-[#f0eeeb]" />
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Avatar + identity row */}
              <div className="mb-5 flex items-center gap-4">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile photo"
                    className="h-14 w-14 rounded-full border border-[#e5e5e5] object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[#F97316]/10 text-lg font-bold text-[#F97316]">
                    {profile ? getInitials(profile) : "?"}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">
                    {profile?.display_name ?? profile?.full_name ?? "—"}
                  </p>
                  <p className="text-sm text-[#6b7280]">{profile?.email ?? "—"}</p>
                  <span className="mt-1.5 inline-block rounded-full bg-[#F97316]/10 px-2.5 py-0.5 text-xs font-semibold text-[#F97316]">
                    {planMeta.label}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#9ca3af]">
                    Display name
                  </label>
                  <div className="rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2 text-sm text-[#374151]">
                    {profile?.display_name ?? profile?.full_name ?? "—"}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#9ca3af]">Email</label>
                  <div className="rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2 text-sm text-[#374151]">
                    {profile?.email ?? "—"}
                  </div>
                </div>
                {profile?.created_at && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#9ca3af]">
                      Member since
                    </label>
                    <div className="rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2 text-sm text-[#374151]">
                      {formatDate(profile.created_at)}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Chat Personality */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-1 flex items-center gap-2 text-[#1a1a1a]">
            <Sparkles size={18} />
            <h2 className="text-base font-semibold">Chat Personality</h2>
          </div>
          <p className="mb-5 text-sm text-[#6b7280]">
            Choose how Beomz talks to you while building.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Random card */}
            <button
              onClick={() => handleSelect("random")}
              className={`rounded-xl border p-3.5 text-left transition-all ${
                selectedId === "random"
                  ? "border-[#F97316] bg-[#F97316]/5"
                  : "border-[#e5e5e5] bg-[#faf9f6] hover:border-[#F97316]/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#1a1a1a]">Random</span>
                {selectedId === "random" && (
                  <span className="text-xs text-[#F97316]">&#10003;</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#9ca3af]">Different personality each session</p>
              <p className="mt-2 text-xs italic text-[#c4b8a8]">Surprise me</p>
            </button>

            {/* Personality cards */}
            {ALL_PERSONALITIES.map((id) => {
              const label = PERSONALITY_LABELS[id];
              const isSelected = selectedId === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  className={`rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-[#F97316] bg-[#F97316]/5"
                      : "border-[#e5e5e5] bg-[#faf9f6] hover:border-[#F97316]/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1a1a1a]">{label.name}</span>
                    {isSelected && (
                      <span className="text-xs text-[#F97316]">&#10003;</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#9ca3af]">{label.tagline}</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs italic text-[#c4b8a8]">
                    {label.preview}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Billing */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <CreditCard size={18} />
            <h2 className="text-base font-semibold">Billing</h2>
          </div>

          {loadingCredits ? (
            <div className="mb-5 space-y-3">
              <div className="h-16 animate-pulse rounded-xl bg-[#f0eeeb]" />
              <div className="h-16 animate-pulse rounded-xl bg-[#f0eeeb]" />
            </div>
          ) : (
            <div className="mb-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-[#9ca3af]">Current plan</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1a1a1a]">
                    {planMeta.label}
                    {planMeta.price && planMeta.price !== "$0" && (
                      <span className="ml-1.5 font-normal text-[#6b7280]">{planMeta.price}</span>
                    )}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isFree
                      ? "bg-[#f3f4f6] text-[#6b7280]"
                      : "bg-[#F97316]/10 text-[#F97316]"
                  }`}
                >
                  {isFree ? "Free" : "Active"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-[#9ca3af]">Credits balance</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#F97316]">{balance} cr</p>
                </div>
                <Zap size={16} className="text-[#F97316]" />
              </div>

              {isFree && (
                <p className="text-xs text-[#9ca3af]">
                  Free plan · one-time credits (100 cr on signup, never reset)
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => void handleOpenPortal()}
            disabled={openingPortal}
            className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:border-[#F97316]/30 hover:bg-[#faf9f6] disabled:opacity-50"
          >
            <ExternalLink size={14} />
            {openingPortal ? "Opening…" : "Open Stripe Portal"}
          </button>
        </section>

        {/* Wallet */}
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <Wallet size={18} />
            <h2 className="text-base font-semibold">Wallet</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled
              className="flex cursor-not-allowed items-center gap-2 rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-4 py-2 text-sm text-[#9ca3af] opacity-50"
            >
              <Lock size={14} />
              Connect Wallet
            </button>
            <span className="text-xs text-[#9ca3af]">Phase 2 &mdash; $BEOMZ staking</span>
          </div>
        </section>
      </div>
    </div>
  );
}
