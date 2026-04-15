/**
 * ProfilePage — user profile with account info, personality selector, and usage.
 * Light theme — cream #faf9f6, single column, max-w-2xl centered.
 */
import { useState } from "react";
import { User, Sparkles, Zap, Mail, Calendar } from "lucide-react";
import { useAuth } from "../../../lib/useAuth";
import { useCredits } from "../../../lib/CreditsContext";
import {
  ALL_PERSONALITIES,
  PERSONALITY_LABELS,
  getPersonality,
  isRandomMode,
  setPersonality,
  setRandomPersonality,
  type PersonalityId,
} from "../../../lib/personalities";
import { getApiBaseUrl } from "../../../lib/api";
import { usePricingModal } from "../../../contexts/PricingModalContext";

export function ProfilePage() {
  const { session } = useAuth();
  const { credits } = useCredits();
  const { openPricingModal } = usePricingModal();

  const [selectedId, setSelectedId] = useState<PersonalityId | "random">(() =>
    isRandomMode() ? "random" : getPersonality(),
  );

  const handleSelect = (id: PersonalityId | "random") => {
    setSelectedId(id);
    if (id === "random") {
      setRandomPersonality();
    } else {
      setPersonality(id);
    }
  };

  const user = session?.user;
  const rawAvatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const avatarUrl = rawAvatarUrl?.includes("googleusercontent.com")
    ? `${getApiBaseUrl()}/avatar?url=${encodeURIComponent(rawAvatarUrl)}`
    : rawAvatarUrl;
  const fullName =
    (user?.user_metadata?.full_name as string | undefined)
    ?? (user?.user_metadata?.name as string | undefined)
    ?? "";
  const email = user?.email ?? "";
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";
  const initials = fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");

  const planName = credits?.plan ?? "Free";
  const balance = credits?.balance ?? 0;
  const monthly = credits?.monthly ?? 0;
  const topup = credits?.topup ?? 0;

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-2xl font-bold text-[#1a1a1a]" style={{ fontFamily: "DM Sans, sans-serif" }}>
          Profile
        </h1>

        {/* Account */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-5 flex items-center gap-2 text-[#1a1a1a]">
            <User size={18} />
            <h2 className="text-lg font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>Account</h2>
          </div>

          <div className="flex items-center gap-4 mb-6">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-16 w-16 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F97316] text-lg font-bold text-white">
                {initials || "U"}
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-[#1a1a1a]">{fullName || "User"}</p>
              <p className="text-sm text-[#9ca3af]">{email}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-[#f0eeeb] bg-[#faf9f6] px-4 py-2.5">
              <Mail size={14} className="flex-none text-[#9ca3af]" />
              <div>
                <p className="text-[11px] text-[#9ca3af]">Email</p>
                <p className="text-sm text-[#374151]">{email || "\u2014"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-[#f0eeeb] bg-[#faf9f6] px-4 py-2.5">
              <Calendar size={14} className="flex-none text-[#9ca3af]" />
              <div>
                <p className="text-[11px] text-[#9ca3af]">Member since</p>
                <p className="text-sm text-[#374151]">{memberSince || "\u2014"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Chat Personality */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-1 flex items-center gap-2 text-[#1a1a1a]">
            <Sparkles size={18} />
            <h2 className="text-lg font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>Chat Personality</h2>
          </div>
          <p className="mb-5 text-sm text-[#9ca3af]">
            Choose how Beomz talks to you while building.
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {/* Random card */}
            <button
              onClick={() => handleSelect("random")}
              className={`rounded-xl border p-3 text-left transition-all ${
                selectedId === "random"
                  ? "border-[#F97316] bg-[#fff7ed]"
                  : "border-[#e5e5e5] bg-[#faf9f6] hover:border-[#d1d5db]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#1a1a1a]">Random</span>
                {selectedId === "random" && (
                  <span className="text-xs text-[#F97316]">&#10003;</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#9ca3af]">Different personality each session</p>
            </button>

            {ALL_PERSONALITIES.map((id) => {
              const label = PERSONALITY_LABELS[id];
              const isSelected = selectedId === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-[#F97316] bg-[#fff7ed]"
                      : "border-[#e5e5e5] bg-[#faf9f6] hover:border-[#d1d5db]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1a1a1a]">{label.name}</span>
                    {isSelected && (
                      <span className="text-xs text-[#F97316]">&#10003;</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#9ca3af]">{label.tagline}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Usage */}
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-5 flex items-center gap-2 text-[#1a1a1a]">
            <Zap size={18} />
            <h2 className="text-lg font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>Usage</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#f0eeeb] bg-[#faf9f6] p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Plan</p>
              <p className="mt-1 text-lg font-bold text-[#1a1a1a]">{planName}</p>
            </div>
            <div className="rounded-xl border border-[#f0eeeb] bg-[#faf9f6] p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Credits left</p>
              <p className="mt-1 text-lg font-bold text-[#F97316]">{Math.round(balance)}</p>
            </div>
            <div className="rounded-xl border border-[#f0eeeb] bg-[#faf9f6] p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Monthly</p>
              <p className="mt-1 text-lg font-bold text-[#1a1a1a]">{Math.round(monthly)}</p>
            </div>
          </div>

          {topup > 0 && (
            <p className="mt-3 text-xs text-[#9ca3af]">
              + {Math.round(topup)} top-up credits
            </p>
          )}

          <button
            type="button"
            onClick={openPricingModal}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c0e]"
          >
            <Zap size={14} />
            Upgrade plan
          </button>
        </section>
      </div>
    </div>
  );
}
